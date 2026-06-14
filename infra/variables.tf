# Inputs for the application infrastructure (frontend.tf + backend.tf).

variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "eu-west-2"
}

variable "project_name" {
  description = "Short name used as a prefix for all resources. Must match the prefix used in infra/bootstrap's IAM policy."
  type        = string
  default     = "irb-rwa-calculator"
}

variable "lambda_image_tag" {
  description = "Tag of the backend image in ECR to deploy (the deploy workflow passes the git SHA)."
  type        = string
}
