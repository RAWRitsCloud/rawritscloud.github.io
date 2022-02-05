---
layout: post
title:  "Making sense of Microsoft Enterprise Scale Terraform Module Outputs"
author: james
tags: [CAF, Enterprise Scale, Outputs, Locals]
categories: [Terraform, Azure]
image: assets/images/enterprise-scale-image.jpg
description: "Looking into how to make the outputs in Enterprise Scale a little more usable."
excerpt: "Looking into how to make the outputs in Enterprise Scale a little more usable."
featured: true
---
## Enterprise Scale Terraform Module

The Enterprise Scale Terraform module by Microsoft has been getting alot of attention, it is Microsofts goal to try and deploy consistent environments on Azure according to their Cloud Adoption Framework model.

We've been using it to deploy to customers in a repetable way however we needed to extend its functionality to include some additional monitoring configurations and some Azure Alerts. To do this our work group created some Policy definitions that we deployed in using the Microsoft module and then we assing them in our in house developed Monitoring Module.

This is when we started to run into problems!

## Using the outputs

We tried to use 3 outputs from the Microsoft module. Those outputs were:

- Root Management Group ID
- Deployed Policy Set IDs
- Log Analytics Workspace ID

The outputs are not exactly what I would call usable. The example of the `module.enterprise_scale.policy_set_definitions` output is below.

As you can see though the key in this object is the ID which if I knew that I wouldn't be calling the output!

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

We had to make this more usable by turning it into an object that we could use the policy name as the key. This was achived by creating a local as follows:

```hcl
locals {
    policy_set_definition = { for polset in module.enterprise_scale.azurerm_policy_set_definition["enterprise_scale"] : polset.name => polset.id }
}
```

Using this command you will get a list like the below instead which can be referenced far easier.

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
