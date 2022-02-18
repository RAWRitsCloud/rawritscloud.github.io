---
layout: post
title:  "Adventures of Key Vault in Terraform"
author: james
tags: [KeyVault, AccessPolicy]
categories: [Terraform, Azure]
image: assets/images/posts/keyvault-in-terraform.jpg
description: "Trying to use Key Vault permissions in 2 different places and it keeps breaking? I have an article for you!"
excerpt: "Trying to use Key Vault permissions in 2 different places and it keeps breaking? I have an article for you!"
featured: true
coverattribute: Photo by <a href="https://unsplash.com/@jdent?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Jason Dent</a> on <a href="https://unsplash.com/s/photos/vault?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Unsplash</a>
---
## Access Policy Resources vs Embedded Access Policy

There is 2 ways to manage access policies in Terraform when it comes to Key Vault. You either use [azurerm_key_vault_access_policy](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/key_vault_access_policy) or you use the "access_policy" block inside the [azurerm_key_vault](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/key_vault)

These 2 methods conflict with each other when you try to use them both as per the warning at the top of the Key Vault Resource page.
![Screenshot of Key Vault warning of Access Policies](/assets/images/posts/assets/keyvault-in-terraform-keyvaultwarning.png)

## Therein lies the problem

What if you need to use both though? Because you're playing chicken and egg with your permissions.

My scenario probably isn't an overly common one but I will explain.

Creating a Key Vault by default you would include the user who's creating the resource as the default access policy using the `data azurerm_client_config` component. In my case this is my Pipeline Service Principal.

When creating a plan the data compenent is set to blank pending a change. While using the `azurerm_key_vault_access_policy` and not including an `access_policy` block in the my Key Vault creation what I found was that every now and then the access policy resource would error on my pipeline which meant my pipeline would no longer run as during the plan stage it needs access to the key that is created inside and with no access policy it was unable to refresh the state.

In addition to this I needed to use the resource instead of the block as I was adding access for a logic app that I was creating in code that was using the Key Vault resource and that had to be created after the Key Vault was created.

## So how did I stop the permission dissapearing?

By no means am I saying that is the right or recommended solution, as often with these things it is simply a solution to a problem at the time.

I've put the code below where I am doing exactly what we are warned we cannot do. I've used the block to the data component so that the Pipeline Service Principal will not be removed and then I've created my logic app's managed idenity as a seperate resource.

How I've got around this is by using `lifecycle` condition which essentially makes Terraform ignore if there is an update to the access policies. As I have said this is not right or recommended it is simply a workaround! [Lifecycle Policies in Terraform](https://www.terraform.io/language/meta-arguments/lifecycle)

```hcl
resource "azurerm_key_vault" "mgmt_keyvault" {
  provider = azurerm.management

  name                = local.key_vault_name
  location            = azurerm_resource_group.managed_services_rg.location
  resource_group_name = azurerm_resource_group.managed_services_rg.name
  tags                = local.logic_app_tags

  enabled_for_disk_encryption = true
  tenant_id                   = data.azurerm_client_config.current.tenant_id
  purge_protection_enabled    = var.purge_protection_enabled
  soft_delete_retention_days  = var.soft_delete_retention_days
  sku_name                    = "standard"

  access_policy {
    tenant_id = data.azurerm_client_config.current.tenant_id
    object_id = data.azurerm_client_config.current.object_id

    secret_permissions = [
      "Get",
      "List",
      "Set"
    ]
  }

  lifecycle {
    ignore_changes = [
      access_policy
    ]
  }
}

resource "azurerm_key_vault_access_policy" "mgmt_keyvault" {
  provider = azurerm.management

  depends_on = [
    azurerm_key_vault.mgmt_keyvault
  ]

  key_vault_id = azurerm_key_vault.mgmt_keyvault.id
  tenant_id    = azurerm_logic_app_workflow.service_now.identity[0].tenant_id
  object_id    = azurerm_logic_app_workflow.service_now.identity[0].principal_id

  secret_permissions = [
    "Get",
    "List"
  ]
}
```
