# One-time bootstrap config, applied manually with local state (see
# infra/README.md). Creates the pieces the main infra/ config depends on but
# can't create for itself:
#
#   - an S3 bucket + DynamoDB table for Terraform remote state/locking
#   - a GitHub Actions OIDC identity provider + IAM role that the deploy
#     workflow assumes (no long-lived AWS credentials in GitHub secrets)

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

# --- Remote state backend -------------------------------------------------

# Bucket names are globally unique across all of AWS, so a random suffix is
# appended to avoid collisions with other Terraform users.
resource "random_id" "state_bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "terraform_state" {
  bucket = "${var.project_name}-tfstate-${random_id.state_bucket_suffix.hex}"
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "terraform_lock" {
  name         = "${var.project_name}-tf-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}

# --- GitHub Actions OIDC ----------------------------------------------------

# GitHub's OIDC token signing certificate thumbprints. AWS validates the
# provider's TLS certificate chain against these on each token exchange.
resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}

data "aws_iam_policy_document" "github_actions_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Restrict to workflow runs triggered from this repository (any branch,
    # tag, PR or environment).
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:*"]
    }
  }
}

resource "aws_iam_role" "github_actions_deploy" {
  name               = "${var.project_name}-github-actions-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_role.json
}

# Permissions the deploy workflow needs to manage the infra/ resources and
# Terraform state. Scoped to resources named after var.project_name where
# the AWS API allows it; a few services (ECR auth, CloudFront, API Gateway)
# require account-wide actions or resource IDs that don't exist until first
# apply, so those are scoped to the account/region instead of "*" globally.
data "aws_iam_policy_document" "github_actions_deploy" {
  statement {
    sid    = "TerraformState"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = [
      aws_s3_bucket.terraform_state.arn,
      "${aws_s3_bucket.terraform_state.arn}/*",
    ]
  }

  statement {
    sid       = "TerraformLock"
    effect    = "Allow"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
    resources = [aws_dynamodb_table.terraform_lock.arn]
  }

  statement {
    sid    = "FrontendBucket"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:PutBucketPolicy",
      "s3:GetBucketPolicy",
      "s3:GetBucketAcl",
      "s3:GetBucketCORS",
      "s3:GetBucketWebsite",
      "s3:GetBucketVersioning",
      "s3:GetBucketLogging",
      "s3:GetLifecycleConfiguration",
      "s3:GetBucketRequestPayment",
      "s3:GetBucketTagging",
      "s3:GetReplicationConfiguration",
      "s3:GetAccelerateConfiguration",
      "s3:GetBucketObjectLockConfiguration",
      "s3:GetEncryptionConfiguration",
      "s3:PutBucketPublicAccessBlock",
      "s3:GetBucketPublicAccessBlock",
      "s3:CreateBucket",
      "s3:DeleteBucket",
      "s3:PutEncryptionConfiguration",
    ]
    resources = [
      "arn:aws:s3:::${var.project_name}-frontend-*",
      "arn:aws:s3:::${var.project_name}-frontend-*/*",
    ]
  }

  statement {
    sid    = "EcrRepository"
    effect = "Allow"
    actions = [
      "ecr:CreateRepository",
      "ecr:DeleteRepository",
      "ecr:DescribeRepositories",
      "ecr:GetLifecyclePolicy",
      "ecr:SetRepositoryPolicy",
      "ecr:GetRepositoryPolicy",
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:TagResource",
      "ecr:ListTagsForResource",
    ]
    resources = ["arn:aws:ecr:${var.aws_region}:${data.aws_caller_identity.current.account_id}:repository/${var.project_name}-*"]
  }

  statement {
    # ECR login tokens are account-wide and cannot be scoped to a repository.
    sid       = "EcrAuth"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "LambdaFunction"
    effect = "Allow"
    actions = [
      "lambda:CreateFunction",
      "lambda:DeleteFunction",
      "lambda:GetFunction",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:GetFunctionConfiguration",
      "lambda:AddPermission",
      "lambda:RemovePermission",
      "lambda:GetPolicy",
      "lambda:TagResource",
      "lambda:ListTags",
      "lambda:ListVersionsByFunction",
    ]
    resources = ["arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${var.project_name}-*"]
  }

  statement {
    sid    = "LambdaExecRole"
    effect = "Allow"
    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:GetRole",
      "iam:PassRole",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:GetRolePolicy",
      "iam:TagRole",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
    ]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.project_name}-*"]
  }

  statement {
    sid       = "LambdaLogs"
    effect    = "Allow"
    actions   = ["logs:CreateLogGroup", "logs:DeleteLogGroup", "logs:PutRetentionPolicy", "logs:TagResource", "logs:ListTagsForResource"]
    resources = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.project_name}-*"]
  }

  statement {
    # DescribeLogGroups is a list operation that CloudWatch Logs evaluates
    # against "log-group:*" regardless of the policy's resource pattern, so
    # it can't be scoped to a specific log group name like the statement
    # above.
    sid       = "LambdaLogsDescribe"
    effect    = "Allow"
    actions   = ["logs:DescribeLogGroups"]
    resources = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:*"]
  }

  statement {
    # API Gateway and CloudFront resource IDs are generated on creation, so
    # these can't be scoped to a specific ARN ahead of time.
    sid    = "ApiGatewayAndCloudFront"
    effect = "Allow"
    actions = [
      "apigateway:*",
      "cloudfront:CreateDistribution",
      "cloudfront:GetDistribution",
      "cloudfront:UpdateDistribution",
      "cloudfront:DeleteDistribution",
      "cloudfront:TagResource",
      "cloudfront:ListTagsForResource",
      "cloudfront:CreateOriginAccessControl",
      "cloudfront:GetOriginAccessControl",
      "cloudfront:UpdateOriginAccessControl",
      "cloudfront:DeleteOriginAccessControl",
      "cloudfront:CreateInvalidation",
      "cloudfront:GetInvalidation",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_actions_deploy" {
  name   = "${var.project_name}-deploy-policy"
  role   = aws_iam_role.github_actions_deploy.id
  policy = data.aws_iam_policy_document.github_actions_deploy.json
}
