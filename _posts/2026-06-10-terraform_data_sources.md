---
layout: post
title: "Terraform Data Sources Explained: Reading Azure Without Rebuilding It"
date: 2026-07-10 00:00:00 +0000
categories: [Terraform]
tags: [Terraform, Azure, Data Sources, Infrastructure as Code]
author: james
excerpt: "Learn how Terraform data sources work in Azure, when to use them, and the common mistakes that catch engineers out in enterprise Landing Zone deployments."
---

# Terraform Data Sources Explained

You've probably done it at some point.

You inherit an Azure environment with hundreds of existing resources, open a Terraform project and immediately wonder whether you need to recreate everything just so Terraform can reference it. Before long you're halfway through writing resources that already exist, planning imports you don't actually need, or hardcoding IDs because it feels like the quickest option.

I've seen all three happen on enterprise projects.

The reality is much simpler. Terraform doesn't just create infrastructure—it can also **read** infrastructure. That's exactly what data sources are for. They allow Terraform to retrieve information about existing Azure resources and use those values elsewhere in your configuration without taking ownership of them.

If you're working in Azure Landing Zones, this becomes incredibly important. Platform teams often manage shared networking, identity, DNS and monitoring whilst application teams deploy workloads into that existing estate. Understanding data sources is one of the biggest steps towards writing reusable Terraform that fits neatly into enterprise environments rather than fighting against them.

In this article we'll look at what data sources actually are, when to use them, when not to use them, common pitfalls, and several practical Azure examples that you'll almost certainly encounter.

---

# High-Level Architecture

```text
                   Azure Subscription
+------------------------------------------------+

 Existing Resources

 ┌─────────────┐
 │ Resource    │
 │ Group       │
 └─────┬───────┘
       │
 ┌─────▼───────┐
 │ Virtual     │
 │ Network     │
 └─────┬───────┘
       │
 ┌─────▼────────┐
 │ Key Vault    │
 └──────────────┘

          ▲
          │ Read Only
          │

      Terraform
      Data Sources

          │

          ▼

 New Terraform Resources
 consume existing IDs,
 names and properties
```

---

## What Is a Data Source?

The easiest way to think about a data source is this:

> **Resources create things. Data sources read things.**

A Terraform resource tells Azure to build or manage something.

A Terraform data source simply asks Azure for information.

That distinction is important because Terraform treats them completely differently.

| Resource | Data Source |
|----------|-------------|
| Creates infrastructure | Reads infrastructure |
| Managed in state | Read during plan |
| Can change Azure | Cannot change Azure |
| Lifecycle controlled | Read-only |

Once that clicks, Terraform configurations suddenly become much cleaner.

Instead of recreating an existing Virtual Network, you simply ask Azure for its ID and plug that into your new subnet, virtual machine or private endpoint.

---

## Why Enterprise Azure Depends on Data Sources

Small lab environments often create everything in one Terraform project.

Enterprise environments almost never do.

A typical Azure Landing Zone might look something like this:

- Platform team owns networking
- Security team owns Key Vaults
- Identity team owns Managed Identities
- Central team owns Log Analytics
- Application teams deploy workloads

Your Terraform shouldn't attempt to recreate any of those shared services.

Instead, it consumes them.

I've worked on Landing Zones where the networking module hadn't changed in over a year, whilst dozens of application deployments happened every week. Data sources allowed every workload deployment to discover the shared infrastructure automatically without anyone copying resource IDs into variables.

That separation keeps ownership clear and dramatically reduces accidental changes.

---

## Example 1 — Reading an Existing Resource Group

Let's start with something simple.

Suppose your platform team already created a resource group.

Instead of hardcoding the name throughout your code, read it once.

```hcl
data "azurerm_resource_group" "platform" {
  name = "rg-platform-prod-uksouth"
}

resource "azurerm_storage_account" "logs" {
  name                     = "rawlogs001"
  resource_group_name      = data.azurerm_resource_group.platform.name
  location                 = data.azurerm_resource_group.platform.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}
```

Notice that Terraform never manages the resource group.

It simply retrieves its properties and uses them elsewhere.

If the location ever changed, every dependent resource would automatically pick up the correct value during planning.

---

## Example 2 — Deploying into an Existing Virtual Network

This is probably the most common Azure scenario.

Networking is usually managed centrally, but application teams still need to deploy into it.

```hcl
data "azurerm_virtual_network" "hub" {
  name                = "vnet-hub-prod"
  resource_group_name = "rg-network-prod"
}

data "azurerm_subnet" "app" {
  name                 = "snet-app"
  virtual_network_name = data.azurerm_virtual_network.hub.name
  resource_group_name  = "rg-network-prod"
}
```

You can now reference:

```hcl
subnet_id = data.azurerm_subnet.app.id
```

No variables.

No copied resource IDs.

No risk that someone pasted the wrong subscription ID into a configuration file.

---

## Example 3 — Reading an Existing Key Vault

Key Vault is another common example.

Security teams often own vault creation, but application teams need to reference secrets.

```hcl
data "azurerm_key_vault" "shared" {
  name                = "kv-shared-prod"
  resource_group_name = "rg-security-prod"
}

data "azurerm_key_vault_secret" "sql_password" {
  name         = "sql-admin-password"
  key_vault_id = data.azurerm_key_vault.shared.id
}
```

Be careful here.

Terraform stores retrieved values in state.

If you're reading secrets, make sure your remote state is properly secured using Azure Storage with encryption, RBAC and restricted access.

Just because a value came from Key Vault doesn't mean it disappears afterwards.

---

## When Should You Use Data Sources?

A simple rule has served me well.

**If someone else owns it, read it.**

Good candidates include:

- Existing Virtual Networks
- Resource Groups
- Managed Identities
- Log Analytics Workspaces
- Key Vaults
- Shared DNS Zones
- Existing Storage Accounts

Bad candidates include resources your Terraform module is responsible for creating.

If your configuration creates a Storage Account, don't immediately look it up again using a data source.

Just reference the resource directly.

```hcl
resource "azurerm_storage_account" "example" {
  ...
}

resource "azurerm_storage_container" "logs" {
  storage_account_name = azurerm_storage_account.example.name
}
```

Using a data source here just introduces unnecessary Azure API calls.

---

## How Terraform Evaluates Data Sources

One thing that catches people out is *when* Terraform reads them.

The process looks roughly like this.

```text
terraform plan

      │

Read Data Sources

      │

Build Dependency Graph

      │

Calculate Changes

      │

terraform apply
```

Terraform retrieves data sources during planning.

If Azure can't find the resource, planning fails before anything is deployed.

That's usually a good thing because it tells you immediately that something isn't configured correctly.

---

# Before vs After

```text
Before

Variable
  │
  ▼

Hardcoded Resource ID

/subscriptions/...
/resourceGroups/...

Problems

✖ Easy to mistype
✖ Difficult to reuse
✖ Breaks between environments


After

Terraform Data Source
        │
        ▼

Automatically discover
existing infrastructure

✔ Reusable
✔ Cleaner code
✔ Environment independent
```

---

## Performance Considerations

Most projects won't notice any difference.

However, very large enterprise deployments might query hundreds of data sources during planning.

Each one is effectively another Azure API call.

I've seen modules that queried the same Virtual Network ten or fifteen times because every child module declared its own data source.

A better approach is to read shared resources once and pass the IDs into child modules.

You'll reduce API calls and make dependencies much clearer.

---

## Security Considerations

Data sources are read-only, but that doesn't automatically make them harmless.

Keep these points in mind:

- Don't expose sensitive outputs unnecessarily.
- Protect your Terraform state.
- Limit Azure permissions to only what's required.
- Avoid reading secrets unless your deployment genuinely needs them.

Terraform state deserves the same level of protection as production credentials.

---

## Common Mistakes

### Using a data source for something Terraform already created

This is probably the biggest one.

If Terraform owns the resource, reference the resource directly instead of asking Azure to find it again.

---

### Hardcoding resource IDs

Resource IDs change between subscriptions and environments.

Read the resource instead.

Your modules immediately become more portable.

---

### Assuming data sources manage resources

They don't.

If someone deletes the Virtual Network outside Terraform, your next plan simply fails.

Terraform won't recreate it because it never owned it.

---

### Reading secrets without securing state

Key Vault isn't a magic shield.

Terraform stores retrieved values in state unless they're handled carefully.

Secure your backend accordingly.

---

### Duplicating identical data sources

Reading the same Virtual Network twenty times isn't helping anyone.

Retrieve it once and pass the values into child modules.

Your plans will generally be faster and easier to understand.

---

## Summary

Data sources are one of Terraform's simplest features, but they're also one of the most important once you start working in enterprise Azure.

Remember the core distinction: **resources create infrastructure, data sources read infrastructure**. Once you build around that principle, your configurations become easier to reuse, easier to maintain and much better suited to Azure Landing Zones where different teams own different parts of the platform.

If you're writing Terraform that interacts with existing Azure infrastructure, data sources should usually be your first choice. They remove hardcoded values, reduce duplication and keep ownership boundaries clear. Just be mindful of sensitive data, avoid unnecessary lookups, and don't query resources Terraform already manages.

I've lost count of the number of times replacing a handful of hardcoded IDs with data sources has made a deployment easier to understand. It's a small change that pays dividends over the lifetime of a project.

---

## What to Explore Next

- **Terraform Locals: Cleaner Code Without the Clutter**
- **Azure RBAC: Getting Role Assignments Right**
- **Azure Policy Explained**
- Explore the AzureRM provider documentation for supported data sources.
- Look at how modules can accept resource IDs instead of performing duplicate lookups.

---

## Further Reading

- AzureRM Provider Documentation
- Terraform Language Documentation
- Microsoft Azure Landing Zone documentation

---

*If you found this useful, I'd love to hear how you're using Terraform in your own Azure environments. Feel free to connect with me on LinkedIn, explore the sample projects on GitHub, or browse the rest of the articles here on RAWRitsCloud where I cover Azure, Terraform, automation and the occasional lesson learned the hard way.*