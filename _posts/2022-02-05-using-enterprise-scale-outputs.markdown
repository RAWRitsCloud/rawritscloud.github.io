---
layout: post
title:  "Making Enterprise Scale Outputs Actually Useful"
author: james
date: 2022-02-05 00:01 +0000
tags: [CAF, EnterpriseScale, Outputs, Locals]
categories: [Azure, Terraform]
permalink: /using-enterprise-scale-outputs
image: assets/images/posts/enterprise-scale-image.jpg
description: "Looking into how to make the outputs in Enterprise Scale a little more usable."
excerpt: "Looking into how to make the outputs in Enterprise Scale a little more usable."
featured: true
coverattribute: Photo by <a href="https://unsplash.com/@wocintechchat?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Christina @ wocintechchat.com</a> on <a href="https://unsplash.com/s/photos/microsoft?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Unsplash</a>
  
---
## Introduction

If you've worked with the Enterprise Scale Terraform module for any length of time, you've probably hit the same problem I did. The module exposes plenty of outputs, but some of them aren't particularly easy to consume in downstream modules.

I ran into this whilst building a monitoring solution that depended on policy definitions deployed through Enterprise Scale. The information I needed was technically available, but the structure of the output made it awkward to work with. Instead of looking up a policy by name, I found myself needing to know the full resource ID first, which rather defeats the point of having an output.

I've wasted enough afternoons digging through Terraform outputs looking for the right policy definition. If I know the policy name, I should be able to retrieve the ID directly. If I already know the ID, I probably don't need the output.

In this article I'll show how I transformed the Enterprise Scale outputs into something far easier to consume from other modules.

## The Problem with the Default Outputs

We were using the Enterprise Scale module to deploy management groups, policies and monitoring foundations across customer environments. As part of that work we had additional monitoring modules that needed to consume resources created by Enterprise Scale.

One of those requirements was assigning custom policy initiatives. The module exposes the Policy Set Definitions as an output, so on the surface that sounds straightforward enough.

The problem is the structure of the output itself.

The `policy_set_definitions` output uses the full resource ID as the key in the object. That means if you want to retrieve a policy definition, you already need to know the ID you're looking for. For me, that's backwards. Most of the time you know the policy name and need the ID, not the other way around.

A trimmed example of the output is shown below.


```hcl
"policy_set_definition": {
    "value": {
        "/providers/Microsoft.Management/managementGroups/rawritsclouddev/providers/Microsoft.Authorization/policySetDefinitions/Deny-PublicPaaSEndpoints": {
            "description": "This policy initiative is a group of policies that prevents creation of Azure PaaS services with exposed public endpoints",
            "display_name": "Public network access should be disabled for PaaS services",
            "id": "/providers/Microsoft.Management/managementGroups/rawritsclouddev/providers/Microsoft.Authorization/policySetDefinitions/Deny-PublicPaaSEndpoints",
            "management_group_id": "rawritsclouddev",
            "management_group_name": "rawritsclouddev",
            "name": "Deny-PublicPaaSEndpoints",
            "policy_definition_group": [],
            "policy_definition_reference": [],
            "policy_type": "Custom",
            "timeouts": null
        },
        "/providers/Microsoft.Management/managementGroups/rawritsclouddev/providers/Microsoft.Authorization/policySetDefinitions/Deploy-ASCDF-Config": {
            "description": "Deploy Azure Security Center configuration",
            "display_name": "Deploy Azure Security Center configuration",
            "id": "/providers/Microsoft.Management/managementGroups/rawritsclouddev/providers/Microsoft.Authorization/policySetDefinitions/Deploy-ASCDF-Config",
            "management_group_id": "rawritsclouddev",
            "management_group_name": "rawritsclouddev",
            "name": "Deploy-ASCDF-Config",
            "policy_definition_group": [],
            "policy_definition_reference": [],
            "policy_type": "Custom",
            "timeouts": null
        }
    }
}
```

The fix was to reshape the output into a simple lookup where the policy name becomes the key. This was achived by creating a local as follows:

## Building a Better Lookup

```hcl
locals {
    policy_set_definition = { for polset in module.enterprise_scale.azurerm_policy_set_definition["enterprise_scale"] : polset.name => polset.id }
}
```

The result is a much cleaner object where the policy name becomes the lookup key.

```hcl
"policy_set_definition": {
    "value": {
      "Deny-PublicPaaSEndpoints": "/providers/Microsoft.Management/managementGroups/rawritsclouddev/providers/Microsoft.Authorization/policySetDefinitions/Deny-PublicPaaSEndpoints",
      "Deploy-ASCDF-Config": "/providers/Microsoft.Management/managementGroups/rawritsclouddev/providers/Microsoft.Authorization/policySetDefinitions/Deploy-ASCDF-Config"
    }
}

# Reference like this to get the Policy Set Definition ID
local.policy_set_definition["Deny-PublicPaaSEndpoints"]
```

## Why This Approach Works Better

In my experience, most modules consuming Enterprise Scale outputs care about friendly names rather than Azure resource IDs. Optimising for how people actually write Terraform tends to make the code easier to maintain.

By reshaping the output into a simple name-to-ID lookup, your downstream modules become much easier to read and maintain.

Instead of searching through a large object or hard-coding resource IDs, you can reference policies by a friendly name. That's generally what you'll know when writing Terraform anyway.

The local value also gives you a clean abstraction layer. If the Enterprise Scale module changes its output structure in a future release, you only need to update the local rather than every module that consumes it.


## Common Mistakes

### Hard-coding Policy IDs

It's tempting to copy and paste a policy ID into another module, especially when you're troubleshooting. The problem is those references become difficult to track and maintain over time.

Use outputs and lookups instead so your modules remain portable.

### Consuming Complex Outputs Directly

Just because a module exports an output doesn't mean it's in the best format for consumers.

If you find yourself repeatedly writing complex lookup expressions, consider transforming the data into a simpler structure first.

### Designing Around Resource IDs

Most engineers think in terms of policy names, role names or management group names. Build your module interfaces around those concepts rather than Azure resource IDs wherever possible.

## Summary

Terraform outputs should make consuming a module easier, not harder. If you find yourself repeatedly writing complex lookups against the same output, it's usually a sign that the data needs reshaping before it reaches the rest of your codebase.

The Enterprise Scale module exposes a huge amount of useful information, but not every output is structured in the most practical way for downstream modules.

In this case, the Policy Set Definition output was technically correct but awkward to consume because the resource ID was used as the key. A simple Terraform local transformed that output into a much more useful name-to-ID lookup.

It's a small change, but it's one that removes friction from every module that consumes those policies. If you're working heavily with Enterprise Scale, it's worth spending a little time reshaping outputs into formats that make sense for your own environment.

## What to Explore Next

* Using Enterprise Scale outputs across multiple Terraform states
* Designing Terraform module outputs for consumers rather than creators
* Managing custom Azure Policies with Enterprise Scale
* Terraform locals for data transformation and abstraction
