---

layout: post
title: "Terraform Variables vs Locals vs Outputs: Understanding Where Each One Belongs"
date: 2026-07-03 00:00:00 +0000
categories: [Terraform]
tags: [Terraform, Azure, Infrastructure as Code, Modules]
author: james
excerpt: "Variables, locals and outputs all solve different problems in Terraform. Understanding where each belongs makes your modules easier to read, easier to maintain and much simpler to reuse."
---

# Terraform Variables vs Locals vs Outputs

If you've been writing Terraform for a while, you've probably reached the point where a module starts feeling... messy.

The first version looked fine. A handful of variables, a couple of resources and everything was easy to follow. Fast forward a few months and you've added more resources, introduced conditional logic, copied the same naming convention everywhere and somehow every other line references either `var.something` or `module.something_else`.

I've reviewed plenty of Terraform written by teams moving from ARM templates, Bicep or manual Azure deployments, and the same pattern appears time and time again. Variables end up containing internal implementation details, outputs expose values nobody actually needs, and locals barely feature at all.

The irony is that Terraform already gives us everything we need to keep modules organised. The trick isn't learning more syntax—it's understanding which feature solves which problem.

In my own Azure Landing Zone modules, variables, locals and outputs each have a very deliberate role. Locals don't just build resource names; they encapsulate organisational standards, reusable tag collections, security defaults and configuration objects that every resource can consume consistently. That separation makes large modules far easier to evolve without constantly rewriting half the codebase.

In this article we'll look at where each belongs, why confusing them causes maintenance headaches, and the patterns I've found work well across enterprise Azure environments.

---

## Variables, Locals and Outputs All Have Different Jobs

One of the easiest ways to think about Terraform is to imagine you're writing a function.

Every function has three distinct parts:

| Feature   | Purpose                                          | Visible Outside Module |
| --------- | ------------------------------------------------ | ---------------------- |
| Variables | Values supplied by the caller                    | Yes                    |
| Locals    | Internal calculations and reusable configuration | No                     |
| Outputs   | Values returned to the caller                    | Yes                    |

That's really all there is to it.

Variables define what someone deploying your module is allowed to customise.

Outputs expose information that another module or deployment genuinely needs afterwards.

Everything else belongs inside the module.

That's where locals come in.

One mistake I see regularly is treating variables as somewhere to store every value the module might use. Before long you end up with dozens of inputs that nobody fully understands, simply because someone wanted to avoid writing a local.

The opposite can happen with outputs. Just because Terraform *can* expose a value doesn't mean it should. If nothing outside the module consumes it, don't return it.

Keeping those boundaries clear makes modules much easier to understand months later.

---

## Variables Define Your Public Interface

A variable is part of your module's contract.

If somebody deploying your infrastructure needs to decide something, that's usually a variable.

Environment names.

Azure regions.

CIDR ranges.

Resource prefixes.

Those are all reasonable candidates because they're decisions made outside the module.

```hcl
variable "environment" {
  type = string
}

variable "location" {
  type = string
}

variable "owner" {
  type = string
}
```

What shouldn't become variables are implementation details.

For example, if every production deployment should automatically enable zone redundancy or use a particular SKU, I generally don't expose another toggle for that. Instead, I calculate the behaviour inside the module so consumers only provide the information that genuinely varies.

That's especially important in enterprise environments. Every additional variable becomes another opportunity for someone to deploy something inconsistently.

I try to keep module interfaces intentionally small. If someone opening the README has to scroll through fifty input variables before they can deploy anything, the module is probably exposing far more than it needs to.

## Locals Keep Your Modules Maintainable

If variables define the public interface of your module, locals define everything behind the scenes.

This is where I see the biggest missed opportunity.

Many engineers only use locals to build resource names, which is certainly a good starting point, but they're capable of much more than simple string interpolation. In larger Azure environments, I use locals to centralise organisational standards, build reusable configuration objects and prepare data before resources consume it. It keeps the resources themselves focused on *what* they're creating rather than *how* every value is calculated.

### Build Naming Once

Naming conventions have a habit of spreading throughout a module.

Without locals, it's easy to end up repeating the same expression across every resource.

```hcl
resource "azurerm_resource_group" "main" {
  name = "${var.prefix}-${var.environment}-${var.workload}-rg"
}

resource "azurerm_key_vault" "main" {
  name = "${var.prefix}-${var.environment}-${var.workload}-kv"
}

resource "azurerm_log_analytics_workspace" "main" {
  name = "${var.prefix}-${var.environment}-${var.workload}-law"
}
```

It doesn't look too bad until your organisation changes its naming convention.

Now every resource needs updating.

Instead, calculate the common elements once.

```hcl
locals {
  base_name = "${var.prefix}-${var.environment}-${var.workload}"
}

resource "azurerm_resource_group" "main" {
  name = "${local.base_name}-rg"
}

resource "azurerm_key_vault" "main" {
  name = "${local.base_name}-kv"
}

resource "azurerm_log_analytics_workspace" "main" {
  name = "${local.base_name}-law"
}
```

Changing the naming convention becomes a single edit instead of hunting through the module looking for missed interpolations.

---

### Organisational Standards Belong in Locals

Where locals really become valuable is when they represent standards rather than calculations.

Looking through my own modules, many of the locals aren't names at all. They're reusable collections that define how resources should behave across an Azure estate. Rather than every resource redefining the same governance tags, backup settings or security defaults, those decisions are made once and consumed everywhere.

For example, tags are an obvious candidate.

```hcl
locals {
  default_tags = {
    Environment = var.environment
    ManagedBy   = "Terraform"
    Owner       = var.owner
  }
}

resource "azurerm_storage_account" "main" {

  tags = merge(
    local.default_tags,
    {
      Service = "Storage"
    }
  )

}
```

That approach does more than reduce typing.

I've seen Azure Policy assignments fail because somebody forgot a required tag. I've also seen cost reporting become far less useful because resources weren't consistently categorised. Centralising tags makes those problems much less likely.

The same idea applies to security standards, networking defaults and backup policies. If every deployment should follow the same baseline, define it once instead of copying it into every resource.

---

### Build Reusable Configuration Objects

One pattern I've ended up using more and more is building complete objects inside locals rather than individual values.

Instead of scattering related settings throughout multiple resources, group them together.

```hcl
locals {

  naming = {
    resource_group = "${local.base_name}-rg"
    key_vault      = "${local.base_name}-kv"
    storage        = lower(replace("${local.base_name}sa", "-", ""))
  }

}
```

Resources then become much easier to read.

```hcl
resource "azurerm_resource_group" "main" {
  name = local.naming.resource_group
}
```

The same principle works for networking defaults, backup retention, monitoring configuration and security settings. In my own codebase, locals frequently represent reusable configuration objects rather than simple strings, making it much easier to apply consistent standards across multiple modules.

---

### Prepare Data Before Resources Consume It

Another place locals really shine is data transformation.

Terraform resources are much easier to understand when they receive data in exactly the format they need.

Suppose a module accepts a list of subnets.

```hcl
variable "subnets" {
  type = list(object({
    name = string
    cidr = string
  }))
}
```

Rather than forcing the resource to perform the transformation itself, prepare the data once.

```hcl
locals {

  subnet_map = {
    for subnet in var.subnets :
    subnet.name => subnet
  }

}
```

Now the resource stays clean.

```hcl
resource "azurerm_subnet" "this" {

  for_each = local.subnet_map

  name             = each.value.name
  address_prefixes = [each.value.cidr]

}
```

Separating data preparation from resource creation makes modules much easier to follow, particularly once they start growing beyond a handful of resources.

---

## Outputs Should Have a Purpose

Outputs are often treated as harmless.

"If Terraform knows the value, why not expose it?"

Because every output becomes part of your module's public interface.

If another module genuinely needs the resource ID, principal ID or connection information, expose it.

```hcl
output "resource_group_id" {
  value = azurerm_resource_group.main.id
}
```

If nobody consumes the value, leave it inside the module.

Exposing unnecessary outputs creates noise, encourages tighter coupling between modules and makes future refactoring harder because consumers may start relying on values you never intended to support.

I generally ask myself one question before adding an output:

**Will another module actually use this?**

If the answer is no, it probably doesn't belong there.

## Common Mistakes

The longer I work with Terraform, the more convinced I become that most problems aren't caused by Terraform itself—they're caused by blurry boundaries between variables, locals and outputs.

Here are the mistakes I see most often.

### Treating Variables as Internal Storage

Not every value needs to be configurable.

If a value can be derived from other inputs, calculate it inside the module instead of exposing another variable.

I've inherited modules with dozens of optional inputs simply because nobody wanted to use locals. The result was a deployment experience where nobody was entirely sure which variables actually mattered.

Keep your public interface as small as possible.

---

### Repeating Organisational Standards

I've seen modules where every resource defines its own tags, naming convention and security settings.

It works... until someone updates a standard.

Now you're editing twenty resources instead of one.

Whether it's naming conventions, governance tags, backup settings or default NSG rules, define them once and reuse them consistently. That's exactly the approach I take across larger Azure modules because organisational standards inevitably change over time.

---

### Returning Every Resource ID

Outputs should solve a problem.

Returning every resource ID "just in case" creates unnecessary coupling between modules and makes refactoring more difficult later.

If another module genuinely needs the value, expose it.

Otherwise, keep it internal.

---

### Building a Chain of Locals

Locals improve readability—until they don't.

I've reviewed modules where one local referenced another local, which referenced another local, which eventually referenced a variable six screens away.

If understanding a resource means constantly jumping back and forth through the file, you've probably overcomplicated things.

A good local should remove complexity, not relocate it.

---

### Hiding Simple Expressions

Not every calculation deserves its own local.

If an expression is used once and is already obvious, leaving it inline is often easier to understand.

The goal isn't to eliminate expressions from resources.

The goal is to eliminate duplication.

---

## Performance Considerations

One question that comes up occasionally is whether locals improve Terraform performance.

Technically, Terraform evaluates a local once and reuses the result throughout the execution plan.

In reality, you're unlikely to notice any measurable performance improvement from moving string interpolation into a locals block.

The real benefit is maintainability.

Terraform might spend milliseconds evaluating a local.

You'll spend hours reading and maintaining the module over its lifetime.

Optimise for the engineer opening the repository six months from now.

There's a good chance that'll be you.

---

## How They Fit Together

The relationship between variables, locals and outputs is actually quite simple.

```text
                    Module Consumer
                           │
                           ▼
                  ┌─────────────────┐
                  │    Variables    │
                  │  Public Inputs  │
                  └─────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │     Locals      │
                  │ Internal Logic  │
                  │ Naming          │
                  │ Tags            │
                  │ Defaults        │
                  │ Transformations │
                  └─────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │    Resources    │
                  └─────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │     Outputs     │
                  │ Public Results  │
                  └─────────────────┘
                           │
                           ▼
                    Calling Module
```

Once you start thinking about modules this way, Terraform becomes much easier to structure.

Variables are the inputs.

Locals contain the implementation.

Outputs expose the results.

Everything has a clearly defined responsibility.

---

## Summary

Variables, locals and outputs all exist for different reasons, and understanding those boundaries is one of the biggest steps you can take towards writing maintainable Terraform.

Variables should define the decisions that callers are expected to make. Locals should encapsulate everything the module needs internally, whether that's naming conventions, governance standards, reusable configuration objects or data transformations. Outputs should expose only the information that another module genuinely requires.

None of these features are particularly complicated on their own.

The difference comes from using each one for its intended purpose.

As modules grow from a handful of Azure resources to complete Landing Zone deployments spanning multiple subscriptions, that separation becomes increasingly valuable. It reduces duplication, keeps organisational standards consistent and makes future changes significantly less painful.

When I start a new module now, I spend just as much time thinking about its public interface as I do the resources themselves. A clean interface is usually the difference between a module that's easy to reuse and one that slowly becomes impossible to maintain.

---

## What to Explore Next

If you're looking to go further, these topics build naturally on what we've covered here:

* **Terraform Locals: Cleaner Code Without the Clutter** – Taking a deeper look at advanced local patterns and reusable configuration.
* **Building Reusable Azure Terraform Modules** – Designing opinionated modules without overwhelming consumers with configuration.
* **Using `for_each` and Dynamic Blocks Effectively** – Scaling Azure deployments without duplicating resources.
* **Azure Verified Modules** – Exploring how Microsoft's published Terraform modules structure variables, locals and outputs.

---

## Final Thoughts

Terraform doesn't become difficult because the language is complicated.

It becomes difficult when modules try to do too much, expose too many decisions and blur the line between configuration and implementation.

Keeping variables, locals and outputs in their respective lanes won't magically solve every problem, but it will make your code easier to understand, easier to review and much easier to change when requirements inevitably shift.

I've found that's particularly true in enterprise Azure environments. Standards evolve, governance requirements change and modules live far longer than anyone expects. A little structure early on saves a surprising amount of effort later.

If you've got your own patterns for structuring Terraform modules, I'd be interested to hear them. Feel free to connect with me on LinkedIn, explore the examples on my GitHub, or browse the rest of the Terraform content here on RAWRitsCloud.
