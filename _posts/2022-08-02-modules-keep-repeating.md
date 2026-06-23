---
layout: post
title:  "Terraform Modules, a little bit of repeating"
author: james
date: 2022-09-02 00:01 +0000
tags: [IaC, Terraform]
categories: [Terraform Modules]
image: assets/images/posts/modules-keep-repeating.jpg
description: "Talking about how and where you create repetition with modules."
excerpt: "Talking about how and where you create repetition with modules."
featured: true
coverattribute: Photo by <a href="https://unsplash.com/es/@mitchel3uo?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Mitchell Luo</a> on <a href="https://unsplash.com/s/photos/repeat?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Unsplash</a>
  
---

One of the main selling points of Terraform modules is repeatability — but "repeatable" means two different things and picking the wrong one causes real problems. You can repeat *within* a module (deploying multiple of the same resource) or repeat *the module itself* (deploying the same module into multiple regions or environments). The approach you choose at design time shapes how flexible your module is later.

This article covers both patterns with real examples, and explains when to reach for `count` versus `for_each`.

---

## Repeatability Within the Module

When you need multiple instances of a resource inside a module, you have two main options: `count` and `for_each`. They're not interchangeable — each suits different situations.

### Count

`count` is useful when you need a fixed number of identical resources. The example below deploys a configurable number of Windows domain controllers. The `format` function builds a zero-padded name from a prefix variable, so you get `DC01`, `DC02`, and so on.

One gotcha: `count` has a hard dependency on ordering. Remove the first item from a list and Terraform will try to recreate every resource after it. That's fine for a VM you own entirely, but painful for anything stateful.

```hcl
resource "azurerm_windows_virtual_machine" "main" {
  count = var.ad_host_count

  name                = format("%s%02d", var.ad_host_prefix, count.index + 1)
  location            = azurerm_resource_group.adds.location
  resource_group_name = azurerm_resource_group.adds.name

  network_interface_ids = [azurerm_network_interface.main[count.index].id]

  size           = var.ad_machine_sku
  admin_username = var.admin_username
  admin_password = random_password.ad_admin.result

  source_image_reference {
    publisher = "MicrosoftWindowsServer"
    offer     = "WindowsServer"
    sku       = var.ad_servers_os
    version   = "latest"
  }

  os_disk {
    name                 = format("%s-disk-%s-osdisk-%02d", var.customer_prefix, var.ad_host_prefix, count.index + 1)
    caching              = "ReadWrite"
    storage_account_type = var.disk_type
  }

  boot_diagnostics {
    storage_account_uri = null
  }
}
```

### For Each

`for_each` with a map is better when you need named, distinct resources where each has different properties. Because Terraform tracks resources by their key rather than their position, removing one entry won't trigger a cascade of replacements.

The example below creates Backup Policies from a map variable. Each key becomes the resource name and doubles as the unique identifier Terraform uses to track it.

**Inside the module — `main.tf`:**

```hcl
resource "azurerm_backup_policy_vm" "main" {
  for_each = var.vm_policies

  name                = each.key
  resource_group_name = azurerm_resource_group.backup.name
  recovery_vault_name = azurerm_recovery_services_vault.main.name

  instant_restore_retention_days = each.value["instant"]

  backup {
    frequency = "Daily"
    time      = each.value["time"]
  }

  retention_daily {
    count = each.value["daily"]
  }

  retention_weekly {
    count    = each.value["weekly"]
    weekdays = ["Sunday"]
  }

  retention_monthly {
    count    = each.value["monthly"]
    weekdays = ["Sunday"]
    weeks    = ["First"]
  }
}
```

**`terraform.tfvars`:**

```hcl
vm_policies = {
  1yr2300 = {
    instant = 5,
    time    = "23:00",
    daily   = 35,
    weekly  = 5,
    monthly = 12
  },
  3yr2300 = {
    instant = 5,
    time    = "23:00",
    daily   = 35,
    weekly  = 5,
    monthly = 36
  }
}
```

## Repeatability of the Module Itself

Repeating the entire module is the more common pattern — deploying the same module into multiple regions or environments. This is where `for_each` with a map really shines. `count` doesn't make sense here because each deployment has meaningfully different configuration (location, address space, etc.).

**`main.tf`:**

```hcl
module "hub" {
  for_each = var.hubs

  source = "git::https://dev.azure.com/rawritscloud/TerraformModules/_git/terraform-azurerm-hub?ref=v1.0.0"

  location           = each.key
  hub_address_prefix = each.value["hub_address_prefix"]
}
```

**`terraform.tfvars`:**

```hcl
hubs = {
  uksouth = {
    hub_address_prefix = "10.100.0.0/23"
  },
  ukwest = {
    hub_address_prefix = "10.101.0.0/23"
  }
}
```

Notice the `source` block references a specific Git tag (`ref=v1.0.0`). This is important — if you're pointing at `main`, any change to the module will affect all your deployments on the next apply.

## Common Mistakes

**Using `count` for resources with different names or properties.** Once your resources diverge — different SKUs, different names, different configurations — `count` breaks down. Reach for `for_each` with a map instead.

**Using `count` at the module level for multi-region.** If each region has any configuration difference, `count` forces you to shove those differences into indexed lists, which quickly becomes unreadable. A `for_each` map is almost always the right choice at the module level.

**Not pinning the source to a tag.** Pointing at `main` means a breaking change to the module hits every consumer on their next apply. Always pin to a release tag.

**Forgetting about uniqueness with `count`.** When using `count`, you're responsible for ensuring every resource has a unique name. Use `format` with `count.index` — and be aware that the index starts at zero, not one.

## Summary

Use `count` when you need a simple, numbered set of identical resources and don't expect to remove items from the middle. Use `for_each` with a map when resources have distinct identities, different properties, or when you're repeating the entire module across environments. At the module level, `for_each` is almost always the right choice. Pin your module source to a Git tag so you control when updates roll out.

## What to Explore Next

- **Automating module workflows** — documentation generation and testing pipelines (next in this series)
- [Terraform `for_each` documentation](https://developer.hashicorp.com/terraform/language/meta-arguments/for_each)
- [Terraform `count` documentation](https://developer.hashicorp.com/terraform/language/meta-arguments/count)
- [Terraform module sources — Git](https://developer.hashicorp.com/terraform/language/modules/sources#github)
