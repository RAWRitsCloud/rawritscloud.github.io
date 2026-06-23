---
layout: post
title:  "Terraform Modules, what are they?"
author: james
date: 2022-08-19 00:01 +0000
tags: [IaC, Templates, Terraform]
categories: [Terraform Modules]
image: assets/images/posts/lets-talk-modules.jpg
description: "An overview of Terraform modules and talking about processes around them."
excerpt: "An overview of Terraform modules and talking about processes around them."
featured: true
coverattribute: Photo by <a href="https://unsplash.com/@sigmund?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Sigmund</a> on <a href="https://unsplash.com/s/photos/jigsaw?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Unsplash</a>
---

You're three environments deep into your Azure deployment and you've just copy-pasted the same Virtual Network and Firewall configuration for the fourth time this year. It works, but every environment drifts slightly and updating them is a manual headache. This is the problem Terraform modules are built to solve.

Modules let you package your infrastructure into reusable, versioned units that can be called consistently across environments. In this article I'll cover what modules actually are, the process I use before writing a single line of HCL, and how to avoid the module sprawl that catches most teams out.

---

## What is a Module?

A module is, for all intents and purposes, a folder containing Terraform code — but unlike a standard configuration, its purpose is to be deployed in a repeatable, consistent fashion across many different contexts.

A good example is the [Microsoft Enterprise Scale Landing Zones module](https://github.com/Azure/terraform-azurerm-caf-enterprise-scale). It deploys Policy and Management in Microsoft's recommended pattern whilst still letting you customise almost every aspect of it. It's opinionated where it needs to be and flexible where it matters.

At BT we have a module for deploying Service Desk Monitoring items: Policy assignments, Alerts, Logic Apps, Roles, Key Vaults, a Log Analytics Gateway, and a Monitoring configuration profile for SQL Insights — all deployed consistently every time.

## Building a Process Around Your Module

Before writing any code, you need a process to make sure the module is actually needed. I've seen teams build modules nobody uses because they didn't validate the requirement up front. The steps I follow:

- Gather requirements from the team or customer
- Create a Requirements Document
  - Define high-level resources
  - Discover parent module dependencies
- Circulate the Requirements Document for sign-off
- Create a Design Document
  - Define low-level resources
  - Define outputs of the module
  - Define "parent" modules and how you'll consume their outputs
  - Define state location
  - Define where loops happen (inside the module or at the calling level)
- Circulate the Design Document for sign-off
- Create a Git repo from template (more on that in a later post)

What you end up with is a documentation library you can turn into Markdown pages inside the module repo, or keep as Word Documents in Teams or Confluence. More importantly, it forces an honest conversation up front about whether the module is actually worth building.

## Module Sprawl

It's easy to end up with hundreds of modules quickly, and like many things you'll suffer with sprawl if you're not careful. I've seen modules that wrap a single resource — which defeats the point entirely. If you're creating a module for one `azurerm_resource_group`, just write the resource directly.

Make sure every module you create performs a function that genuinely needs repeating and will deliver real value. The process above should keep sprawl in check by forcing the question before any code gets written.

## Common Mistakes

**Building before validating.** Skipping the requirements and design steps leads to modules nobody adopts, or that need a complete rewrite six months later. The documentation overhead up front is small compared to the cost of a redesign.

**Single-resource modules.** A module wrapping one resource adds complexity without any reuse benefit. Group logically related resources together — a meaningful module usually covers a complete functional unit.

**No versioning from day one.** If you're not tagging releases, everyone consuming your module is pulling from `main` and you'll break them without warning.

**Ignoring state at design time.** How your module interacts with state — especially remote state from other modules — needs to be decided during design, not discovered mid-apply.

## Summary

Modules are how you turn copy-paste Terraform into reliable, repeatable infrastructure. Follow a requirements and design process before writing any code. Group resources logically rather than wrapping single resources. Plan your state layout at design time and version your modules from the start. The overhead up front is real but it pays back quickly once you have more than two environments to manage.

## What to Explore Next

- **Organising your modules** — file naming conventions, storage patterns, and state file design (next in this series)
- **Repetition in modules** — using `count` and `for_each` effectively
- **Automating module workflows** — Terraform Docs and testing pipelines
- [Terraform Module documentation](https://developer.hashicorp.com/terraform/language/modules)
