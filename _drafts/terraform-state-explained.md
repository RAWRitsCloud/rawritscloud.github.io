---
layout: post
title: "Terraform State Explained (And Why It Keeps Biting Enterprise Teams)"
date: 2026-09-25 00:00:00 +0000
categories: [Azure]
tags: [Terraform, Azure, Cloud Architecture, Infrastructure as Code]
author: james
excerpt: "Terraform state causes more production incidents than any other part of the toolchain. Here's what it actually does, where it goes wrong, and how to stop fighting it."
---

Picture this: two engineers on the same landing zone team both run `terraform apply` within ten minutes of each other. One of them gets a lock error, gets impatient, and force-unlocks it. Twenty minutes later, a production NSG that someone else was mid-way through modifying has vanished, and nobody can agree on what the "correct" state of the subscription actually is.

I've been called in to untangle exactly this scenario more than once. It's never actually a Terraform problem — it's a state management problem, and most teams don't think about state until it's already gone wrong.

State is arguably the single most misunderstood part of Terraform, and in an enterprise Azure environment with dozens of engineers touching the same subscriptions, getting it wrong is expensive. This article covers what state actually is, how to structure and secure it properly in Azure, and the mistakes I see enterprise teams make again and again.

## What Terraform State Actually Is

Terraform state is a JSON file that maps the resources in your configuration to the real resources that exist in Azure. Without it, Terraform has no way of knowing that the `azurerm_resource_group.main` block in your `.tf` file corresponds to a specific resource group with a specific ID in your subscription.

Every resource in state carries its provider-assigned ID, its current attributes, and metadata about dependencies. A trimmed-down entry looks like this:

```json
{
  "mode": "managed",
  "type": "azurerm_resource_group",
  "name": "main",
  "instances": [
    {
      "attributes": {
        "id": "/subscriptions/xxxx/resourceGroups/rg-prod-uks",
        "location": "uksouth",
        "name": "rg-prod-uks"
      }
    }
  ]
}
```

This is why `terraform plan` can tell you exactly what's changed without querying every single resource in Azure first — it compares your configuration against the last known state, then checks reality against that. State is the source of truth Terraform trusts. If it's wrong, stale, or missing, everything downstream is wrong too.

## Remote State and Locking in Azure

Local state files (the default `terraform.tfstate` sitting in your working directory) are fine for a solo proof of concept. They are not fine the moment a second person touches the same infrastructure. You need a remote backend, and in Azure that almost always means blob storage.

The `azurerm` backend stores state in a storage account and uses blob leases for locking, so two people can't apply at the same time:

```hcl
terraform {
  backend "azurerm" {
    resource_group_name  = "rg-tfstate-uks"
    storage_account_name = "sttfstateuksprod"
    container_name        = "tfstate"
    key                    = "landing-zone-prod.tfstate"
  }
}
```

That locking behaviour is the whole point. When someone runs `apply`, Terraform acquires a lease on the blob. Anyone else attempting an operation against the same state file gets blocked until the lease is released. This is what stops the two-engineers-one-subscription problem I opened with — assuming nobody force-unlocks it out of impatience, which is its own mistake I'll come back to.

Set the storage account up with versioning enabled. It costs almost nothing and it's saved me on at least two occasions where a state file got corrupted and I needed to roll back to the previous version rather than rebuild it from an import.

## Splitting State for Enterprise Landing Zones

The biggest structural mistake I see is a single, monolithic state file covering an entire landing zone — networking, identity, every workload, all of it. It works fine for the first few months. Then your `plan` takes four minutes to run, a single bad apply can touch resources completely unrelated to what you're actually changing, and every engineer needs broad permissions just to work on their one workload.

Split state by blast radius, not by convenience. Networking and core platform components go in one state. Each workload or application gets its own. Shared values (subnet IDs, DNS zones, and so on) get passed between them using `terraform_remote_state` rather than duplicated:

```hcl
data "terraform_remote_state" "network" {
  backend = "azurerm"

  config = {
    resource_group_name  = "rg-tfstate-uks"
    storage_account_name = "sttfstateuksprod"
    container_name        = "tfstate"
    key                    = "networking-prod.tfstate"
  }
}

resource "azurerm_subnet" "app" {
  virtual_network_name = data.terraform_remote_state.network.outputs.vnet_name
  # ...
}
```

This does mean more moving parts and more backend configs to manage, but it's a trade worth making. When a workload team needs to make a change, they're only ever locking and planning against their own state, not the entire estate.

## Drift, Imports and Keeping State Honest

State drifts. Someone makes a change in the Azure Portal because it was faster than raising a PR, an Azure Policy remediation task modifies a resource automatically, or an old resource gets deleted manually and nobody tells Terraform. Left unchecked, your next `plan` either tries to "fix" a change that was intentional or fails outright because a resource it expects no longer exists.

`terraform plan` is your drift detector — read it properly rather than skimming past it. For anything that's genuinely drifted and needs bringing back under management, `import` is the right tool rather than deleting and recreating:

```bash
terraform import azurerm_key_vault.main /subscriptions/xxxx/resourceGroups/rg-prod-uks/providers/Microsoft.KeyVault/vaults/kv-prod-uks
```

For a wider health check across an entire state file, `terraform state list` combined with a scripted comparison against Azure Resource Graph will surface anything that's fallen out of sync far faster than reviewing plans resource by resource. I run this as a scheduled pipeline job on every production landing zone I look after — catching drift on a Tuesday morning is a lot less stressful than discovering it during an incident on a Friday afternoon.

## Common Mistakes

**Committing state to Git.** State files can contain plaintext secrets — database passwords, connection strings, certificate contents. Treat a state file the same way you'd treat a credentials file, because functionally it is one.

**Skipping locking to "save time".** Disabling or bypassing locks because it's inconvenient for a CI pipeline is how you get corrupted state. Fix the pipeline, don't remove the safety net.

**One state file for everything.** Covered above, but it's common enough to repeat: monolithic state doesn't scale past a handful of engineers.

**Manually editing `.tfstate`.** I've seen people open the JSON and hand-edit it to "fix" a problem. Use `terraform state mv`, `terraform state rm`, or `import` — they exist precisely so you don't have to do this.

**No storage account access control.** If every engineer's service principal has full write access to the state storage account, you've got no real audit trail of who changed what. Scope access with Azure RBAC, not shared keys.

## Summary

State is what makes Terraform work, and it deserves the same care you'd give any other piece of critical infrastructure. Use a remote backend with locking enabled from day one, even on small projects — retrofitting this later is far more painful. Split state along the lines of who needs to change what, not along the lines of what's convenient to set up first. And treat drift as something to detect and reconcile deliberately, rather than something you discover by accident.

Get these fundamentals right early and state stops being something your team fears touching, and starts being just another part of the toolchain that quietly does its job.

## What to Explore Next

- **Azure RBAC: Getting Role Assignments Right** — for locking down who can actually write to your state storage account
- **Terraform Locals: Cleaner Code Without the Clutter** — useful once your state split starts introducing repeated values across configs
- **Azure Policy Explained** — for understanding the automated changes that are often behind unexpected drift
- HashiCorp's own [state documentation](https://developer.hashicorp.com/terraform/language/state) is worth a proper read once you've got the basics down

If you've got a state horror story of your own, or you want to talk through how you're structuring state across a landing zone, find me on LinkedIn — always happy to compare notes. The examples above, along with a fuller reference setup for splitting state across a landing zone, are on the RAWRitsCloud GitHub repository.