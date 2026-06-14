# Inputs for the one-time bootstrap config (Terraform remote state backend
# + the GitHub Actions OIDC role used by infra/ and the deploy workflow).

variable "aws_region" {
  description = "AWS region for the state bucket, lock table and IAM resources."
  type        = string
  default     = "eu-west-2"
}

variable "project_name" {
  description = "Short name used as a prefix for all resources, including the main infra config."
  type        = string
  default     = "irb-rwa-calculator"
}

variable "github_repository" {
  description = "GitHub repository allowed to assume the deploy role, as \"owner/repo\"."
  type        = string
  default     = "dillonsnyman1/irb-rwa-calculator"
}
