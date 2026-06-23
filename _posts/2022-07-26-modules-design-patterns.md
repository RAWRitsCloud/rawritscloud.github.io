---
layout: post
title:  "Terraform Modules, organising the modules"
author: james
date: 2022-08-26 00:01 +0000
tags: [IaC, Templates, Terraform, Git, Design]
categories: [Terraform Modules]
image: assets/images/posts/modules-design-patterns.jpg
description: "Talking about some of the take aways from my experience of building Terraform modules."
excerpt: "Talking about some of the take aways from my experience of building Terraform modules."
featured: true
coverattribute: Photo by <a href="https://unsplash.com/@medbadrc?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Med Badr  Chemmaoui</a> on <a href="https://unsplash.com/s/photos/design?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Unsplash</a>
  
---

You've built your first module, it works, and now you're wondering where to put it, what to call the files, and how to keep state from becoming a mess. These aren't exciting questions, but getting them wrong costs you later — especially once you have a library of twenty or thirty modules and multiple teams consuming them.

This article covers the organisational decisions that matter most in practice: where to store private modules, how to structure your files, and how to design your state layout before it becomes a headache.

---

## Storing Private Modules

When you're building modules it's tempting to publish them to the [Terraform Registry](https://registry.terraform.io/), but that's rarely practical — especially if they contain IP specific to your product or service.

Where you store them depends on your source control setup. At BT we use Azure DevOps: a single Project with multiple Git repos, one per module. This keeps each module independently versioned and makes it easy to reference specific tags in a `source` block.

That pattern doesn't translate directly to GitHub. There you'd either use independent repos or a single repo with a folder structure per module. Both are workable — it comes down to how you want to handle versioning and access control.

## File Naming

This one will be debated for the ages, but here's my take. Most Terraform purists will tell you `main.tf`, `variables.tf`, `outputs.tf` and you're done. I agreed with that until I started working with people who aren't familiar with Terraform.

I've come to prefer splitting resources by type at a minimum. At BT we prefix resource files with `res-` and variable files with `var-` when we need to split them. You end up with `res-virtualmachines.tf` or `res-resourcegroups.tf`. We've rarely needed to split variables, but having the naming standard ready means it's not a debate when the module grows.

We keep `outputs.tf` as-is and use `versions.tf` for provider and version constraints.

## Repetition

I'll cover `count` and `for_each` in more depth in the next article, but it's worth flagging at the design stage. Think about the key scenarios your module will need to handle — Multi-Region deployments, variable-driven loops for complex configurations — and design for them up front rather than retrofitting later.

## State Files

State planning is one of those things that's easy to skip during design and painful to fix later. You need to be clear about how your module interacts with other modules, and whether those other modules live in a different state file.

At BT we store state centrally in a Storage Account in the Management Subscription, in a single container, split by Management Group following the Enterprise Scale pattern:

- `connectivity.tfstate`
- `management.tfstate`
- `identity.tfstate`
- `application_landing_zone_1.tfstate`
- `application_landing_zone_2.tfstate`

This makes it straightforward to use a `terraform_remote_state` data source across modules and subscriptions without any guesswork about where state lives.

## Common Mistakes

**Storing everything in one repo with no versioning.** If consumers can't pin to a release tag, any change to the module can silently break them. Tag your releases from day one.

**Three files for every module regardless of size.** `main.tf`, `variables.tf`, `outputs.tf` is fine for a small module. But once you have thirty resources in `main.tf` it becomes unreadable. Split resource files by type early.

**No state planning.** Discovering mid-deployment that two modules need outputs from each other but live in different state files — and nobody planned a `terraform_remote_state` data source — is a bad day. Sort this during design.

**Publishing private modules publicly.** It sounds obvious, but I've seen it happen when someone assumes the Terraform Registry is the only option. Azure DevOps, GitHub, and GitLab all support private module sources.

## Summary

The organisational decisions — where to store modules, how to name files, how to structure state — aren't glamorous but they set the foundation for everything else. Pin your modules to release tags. Split resource files by type once they grow. Plan your state layout before you write any `remote_state` data sources. These decisions take minutes to make up front and save hours of untangling later.

## What to Explore Next

- **Repetition in modules** — `count`, `for_each`, and when to use each (next in this series)
- **Automating module workflows** — documentation generation and testing pipelines
- [Terraform remote state documentation](https://developer.hashicorp.com/terraform/language/state/remote-state-data-sources)
- [Terraform Registry — publishing modules](https://developer.hashicorp.com/terraform/registry/modules/publish)
