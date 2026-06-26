---
layout: post
title: "Terraform Locals: Cleaner Code Without the Clutter"
date: 2026-07-03 00:00:00 +0000
categories: [Terraform]
tags: [Terraform,Azure,Infrastructure as Code,Modules]
author: james
excerpt: "Terraform locals are one of the simplest ways to make your code easier to read, easier to maintain, and far less repetitive. Here's how I use them across large Azure estates."
---

# Terraform Locals: Cleaner Code Without the Clutter

When you first start writing Terraform, it's surprisingly easy to end up repeating yourself. The same resource names appear over and over again, tags are copied into every resource, and conditional expressions creep into places they probably shouldn't.

It works... until it doesn't.

I've reviewed plenty of Terraform written by teams moving from ARM templates or manual Azure deployments, and one thing stands out almost every time: **locals are massively under-used**. Variables end up doing far more than they should, naming conventions are duplicated across dozens of resources, and small changes suddenly require editing half the module.

I've wasted a good afternoon untangling modules where every resource built its own name independently. Miss one update and suddenly your naming convention isn't actually a convention anymore.

Terraform gives you a much cleaner way of organising internal logic.

In this article I'll cover:

* what locals actually are
* how they differ from variables and outputs
* common patterns I use in Azure modules
* where locals can make your code much easier to maintain
* when you've probably gone too far

---

## Variables, Outputs and Locals All Have Different Jobs

Terraform gives you several ways to store values, but each exists for a different reason.

| Feature   | Purpose               | Visible Outside Module |
| --------- | --------------------- | ---------------------- |
| Variables | Module inputs         | Yes                    |
| Outputs   | Module outputs        | Yes                    |
| Locals    | Internal calculations | No                     |

I think of them like a function.

Variables are the function parameters.

Outputs are the return values.

**Locals are everything in between.**

That's the key distinction.

If another module or another person deploying your code needs to supply the value, use a variable.

If Terraform only needs the value internally, use a local.

That simple rule keeps modules much easier to understand.

---

## Stop Repeating Yourself

The first place I nearly always introduce locals is resource naming.

Without locals, you'll often see something like this repeated throughout a module.

```hcl
resource "azurerm_resource_group" "main" {
  name = "${var.prefix}-${var.environment}-${var.application}-rg"
}

resource "azurerm_storage_account" "main" {
  name = "${var.prefix}${var.environment}${var.application}sa"
}

resource "azurerm_key_vault" "main" {
  name = "${var.prefix}-${var.environment}-${var.application}-kv"
}
```

Nothing looks particularly wrong.

Until somebody changes the naming convention.

Now you're editing every resource individually.

**Instead, calculate the common parts once.**

```hcl
locals {
  base_name = "${var.prefix}-${var.environment}-${var.application}"
}

resource "azurerm_resource_group" "main" {
  name = "${local.base_name}-rg"
}

resource "azurerm_key_vault" "main" {
  name = "${local.base_name}-kv"
}
```

Now your naming convention lives in one place.

Every resource automatically follows it.

This is exactly how I build Azure Landing Zone modules. Every resource derives its name from a handful of locals, which makes changing organisational naming standards surprisingly painless.

---

## Merging Tags Without Copying Them Everywhere

Tags are another area where repetition sneaks in.

Every Azure resource needs the same core metadata.

Rather than redefining them repeatedly, create them once.

```hcl
locals {
  default_tags = {
    Environment = var.environment
    ManagedBy   = "Terraform"
    Owner       = var.owner
  }
}
```

When a resource needs extra tags, merge them together.

```hcl
resource "azurerm_storage_account" "main" {

  tags = merge(
    local.default_tags,
    {
      Service = "Storage"
    }
  )

}
```

The result is cleaner code and far less chance of accidentally forgetting a required tag.

I've seen governance policies fail simply because one resource missed a single tag. Centralising them avoids that entirely.

---

## Making `for_each` Easier to Work With

Terraform's `for_each` expects a map.

Real-world inputs are often lists.

Locals are a perfect place to reshape your data before resources consume it.

Suppose you receive this variable.

```hcl
variable "subnets" {
  type = list(object({
    name = string
    cidr = string
  }))
}
```

Transform it into something `for_each` likes.

```hcl
locals {
  subnet_map = {
    for subnet in var.subnets :
    subnet.name => subnet
  }
}
```

Now resource creation becomes much cleaner.

```hcl
resource "azurerm_subnet" "this" {

  for_each = local.subnet_map

  name             = each.value.name
  address_prefixes = [each.value.cidr]

}
```

Rather than embedding complex expressions directly inside resources, you prepare the data once and let everything else consume it.

That separation makes large modules considerably easier to follow.

---

## Environment-Aware Behaviour Without More Variables

One pattern I use regularly is changing behaviour depending on the deployment environment.

Rather than exposing another variable that every caller has to understand, calculate it internally.

```hcl
locals {

  enable_zone_redundancy = (
    var.environment == "production"
  )

}
```

Or perhaps production gets larger SKUs.

```hcl
locals {

  app_service_sku = (
    var.environment == "production"
    ? "P1v3"
    : "B1"
  )

}
```

The module interface stays simple.

Consumers only provide the environment.

The module decides everything else.

That's usually a better experience than expecting every deployment to specify twenty optional settings.

---

## A Real Example From Azure Landing Zones

One pattern I've ended up using repeatedly across Azure estates is building naming once and reusing it everywhere.

Something like this.

```hcl
locals {

  naming = {
    resource_group = "${var.prefix}-${var.environment}-${var.workload}-rg"
    key_vault      = "${var.prefix}-${var.environment}-${var.workload}-kv"
    log_analytics  = "${var.prefix}-${var.environment}-${var.workload}-law"
    storage        = lower(replace("${var.prefix}${var.environment}${var.workload}sa", "-", ""))
  }

}
```

Every resource simply references the relevant value.

```hcl
name = local.naming.resource_group
```

Need to change the organisational naming convention?

Update one local.

Every resource follows automatically.

Across dozens of subscriptions and hundreds of resources, that consistency saves an enormous amount of effort.

---

## Locals Can Go Too Far

Like most Terraform features, locals can be overused.

I've seen modules where nearly every line referenced another local, which referenced another local, which referenced another local.

Eventually you spend more time following the chain than understanding what the module actually does.

A few warning signs:

* Locals depend on five other locals.
* Every calculation is split into tiny pieces.
* You need to scroll between the locals block and the resource constantly.
* Nobody can explain what `local.computed_resource_identifier_v3` actually contains.

If a value is only used once and is already easy to read, don't force it into a local.

The goal is clarity.

Not winning a competition for the biggest `locals {}` block.

---

## Performance Notes

Terraform evaluates locals once and reuses the result throughout the execution plan.

You're not recalculating string interpolation every time you reference a local.

For most configurations, you won't notice a measurable performance improvement.

The real benefit is maintainability.

Terraform spends milliseconds evaluating locals.

You'll spend hours maintaining the code later.

Optimise for the person reading the module six months from now.

That person might even be you.

---

## Common Mistakes

One mistake I see regularly is using variables for internal calculations. If nobody outside the module should set the value, it probably belongs in a local instead.

Another common issue is duplicating naming conventions across every resource. Centralise naming once and reference it everywhere.

Avoid hiding simple expressions behind unnecessary locals. If a calculation is obvious and only appears once, leaving it inline is often clearer.

Finally, don't build chains of dependent locals that require readers to jump backwards and forwards through the file. A local should simplify the code, not turn it into a treasure hunt.

---

## Summary

Terraform locals are one of those features that don't feel particularly exciting until you've built a few larger modules. Then you start wondering how you ever managed without them.

Treat variables as your module's public interface and locals as its internal implementation. Use them to centralise naming conventions, merge tags, reshape data for `for_each`, and make sensible decisions based on deployment environments.

Most importantly, keep them readable. A handful of well-named locals can dramatically improve a module. Hundreds of clever ones usually do the opposite.

Whenever I build Azure modules, locals are one of the first things I add. They keep naming consistent, reduce duplication, and make future changes much less painful. That's a worthwhile trade every time.

---

## What to Explore Next

* Building reusable Azure Terraform modules with opinionated defaults
* Using `for_each` and dynamic blocks effectively in Terraform
* Microsoft Azure Verified Modules and how they structure locals
* HashiCorp's Terraform language documentation for expressions, functions and `for` loops
