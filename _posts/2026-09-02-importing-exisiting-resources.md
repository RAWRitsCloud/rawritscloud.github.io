---
layout: post
title: "Importing Existing Resources: Bringing Azure Under Terraform's Control"
date: 2026-10-02 00:00:00 +0000
categories: [Azure]
tags: [Terraform, Azure, Cloud Architecture, Infrastructure as Code]
author: james
excerpt: "Most enterprise Azure estates weren't born in Terraform — they were clicked together over years. Here's how to bring them under management properly, including where Azure Export for Terraform genuinely helps."
---
It's become one of the more common calls I get these days: a subscription that's been running for years — provisioned by hand, by an ARM template nobody's touched since 2019, or by whatever consultant was in the room at the time — with none of it in Terraform. This wasn't such a frequent request a few years back; most Azure estates simply hadn't had the time to build up this much untracked infrastructure. Now plenty of them have, and bringing an existing estate under Terraform has turned into a proper piece of landing zone work rather than an edge case.

This is where importing comes in — taking resources that already exist and bringing them under Terraform's management without touching the underlying infrastructure. It sounds simple. It's the step where I've seen the most avoidable mistakes, usually because someone imports state without writing matching configuration first, then wonders why the next apply wants to destroy half a resource group.

This article covers the manual import workflow, how to scale it with Azure's own tooling, and the specific mistakes that turn an import exercise into an incident.

## The Basic Import Workflow

Importing links an existing Azure resource to a resource block in your configuration and adds a corresponding entry to state. Terraform does not create anything during an import — it only records that a resource block and a real resource are the same thing.

The critical point people miss: **the configuration has to exist first, or match immediately after**. If you import into state without a resource block, or with one that doesn't match the resource's actual attributes, your next `plan` will show a diff — sometimes a destructive one — because Terraform now thinks your configuration wants something different from reality.

Since Terraform 1.5, the cleanest way to do this is a config-driven import block rather than the legacy `terraform import` command:

```hcl
import {
  to = azurerm_storage_account.data
  id = "/subscriptions/xxxx/resourceGroups/rg-prod-uks/providers/Microsoft.Storage/storageAccounts/stdatauksprod"
}

resource "azurerm_storage_account" "data" {
  name                     = "stdatauksprod"
  resource_group_name      = "rg-prod-uks"
  location                 = "uksouth"
  account_tier             = "Standard"
  account_replication_type = "GRS"
}
```

Run `terraform plan` against this and Terraform shows you exactly what it'll do before touching state — including flagging any attribute mismatches between your config and the real resource. That review step is the whole advantage over the older `terraform import` command, which wrote straight to state with no dry run.

## Manual Imports at Small Scale

For a handful of resources, the legacy command still does the job and doesn't require you to write the import blocks out in advance:

```bash
terraform import azurerm_resource_group.shared \
  /subscriptions/xxxx/resourceGroups/rg-shared-uks
```

You still need a matching `resource` block in your `.tf` files before you run `plan` — the command only touches state, it doesn't generate configuration for you. For one or two resources, writing that HCL by hand is quick enough. It stops being quick somewhere around resource fifteen, which is where most enterprise imports actually sit.

I'll be honest: I default to the legacy command for one-offs and reach for import blocks when I'm importing anything with more than a couple of dependent attributes, purely because the plan preview has saved me from a bad import more than once.

## Bulk Importing with Azure Export for Terraform

Writing HCL by hand for an entire resource group of thirty-plus resources is not a good use of anyone's afternoon. This is where **Azure Export for Terraform** earns its place — a Microsoft-maintained CLI tool, originally released as Azure Terrafy (`aztfy`) and renamed to `aztfexport` in 2023. It inspects existing Azure resources and generates both the Terraform configuration and the state in one pass, rather than making you write config first.

Point it at a resource group and it'll interactively walk you through every resource, suggesting the matching Terraform resource type for each:

```bash
aztfexport resource-group rg-prod-uks
```

For scripted or pipeline use, batch mode skips the interactive prompts and works from a resource mapping file instead, which is the only sane way to run this against anything beyond a handful of resources:

```bash
aztfexport resource-group --non-interactive rg-prod-uks
```

It can also target a single resource by ID, or a custom set of resources defined by an Azure Resource Graph query — useful if you want to import "every Key Vault tagged `env=prod`" rather than an entire resource group at once.

What it doesn't do is guarantee a clean result. The tool is explicit that generated configuration isn't meant to be comprehensive, and won't necessarily let you fully reproduce the infrastructure from scratch using only what it output. Treat its output as a very good first draft, not a finished landing zone module.

## Reviewing What Comes Out the Other End

Whichever route you use, the import itself is the easy part. What actually determines whether this was worth doing is what you do with the generated or hand-written configuration afterwards.

Run `terraform plan` immediately after any import and read it properly rather than skimming for "no changes". A clean plan means your configuration genuinely matches reality; anything else means either your HCL is wrong or the tool guessed at an attribute it shouldn't have. Tidy the output before it goes anywhere near a shared module — pin provider versions explicitly, replace any hardcoded IDs with variables or data sources, and check for secrets sitting in plaintext attributes such as connection strings or access keys.

## Common Mistakes

**Importing to state without matching configuration.** The single most common cause of "why does Terraform want to destroy this" — write or generate the config first, then import, then plan.

**Running a bulk export against an entire subscription.** Scope `aztfexport` to a resource group or a Resource Graph query. Running it unscoped against a large subscription is slow, and you'll spend more time reviewing irrelevant resources than you saved.

**Trusting generated HCL without reading it.** Azure Export for Terraform is genuinely good, not infallible. Attribute defaults and resource type guesses need a human check before this goes into a production module.

**Ignoring child and dependent resources.** Role assignments, diagnostic settings, and private endpoints attached to a resource don't always get pulled in automatically — check what's actually been imported against what you expected.

**Doing the whole estate in one PR.** Import resource group by resource group, review each, and merge incrementally. A single sprawling import PR is nearly impossible to review properly.

## Summary

Importing existing resources is entirely routine once you've done it a few times, but it punishes shortcuts. Write or generate configuration that matches reality before you touch state, and always run `plan` straight after an import rather than assuming it went cleanly. For a handful of resources, the legacy `terraform import` command or a hand-written import block is fine. For anything bigger, Azure Export for Terraform will save you real time — just budget time afterwards to review what it produced rather than shipping it as-is.

## What to Explore Next

- **Terraform State Explained** — for what actually happens in state once your imported resources are in it
- **Azure RBAC: Getting Role Assignments Right** — role assignments are one of the resource types most commonly missed during bulk imports
- **Terraform Locals: Cleaner Code Without the Clutter** — useful for tidying up generated configuration once the import is done
- HashiCorp's [import documentation](https://developer.hashicorp.com/terraform/language/import) and the [Azure Export for Terraform](https://github.com/Azure/aztfexport) repository are worth bookmarking before your first large import

If you're mid-way through bringing a legacy Azure estate under Terraform and want to compare notes, find me on LinkedIn. Example import blocks and a sample `aztfexport` batch-mode setup are on the RAWRitsCloud GitHub repository, alongside the other landing zone tooling I've written about.