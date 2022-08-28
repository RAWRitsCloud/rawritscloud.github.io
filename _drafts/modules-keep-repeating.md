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
## Repeatability within the Module

Repeatability is one of the key goals of Modules but you have to decide how to perform that repeatability in your module. Let me give you some examples:

### Count

The count argument can be a really useful argument lets take a Virtual Machine inside of the module for example, below I have a Virtual Machine and I have a variable that allows you to stand up however many Virtual machines with exactly the same settings (in this case I'm creating Virtual Machines that will be domain controllers).

When using the count feature you need to account for uniqueness so the example below uses the format command to use a "Host Prefix" variable along with the count to make a 2 digit number my code comes with a limitation of only being able to create up to 99 virtual machines otherwise the naming convention breaks.

You can access the "number" of the virtual machine though using ``count.index``

```hcl
resource "azurerm_windows_virtual_machine" "main" {
  count = var.ad_host_count

  name                = format("%s%02d", var.ad_host_prefix, count.index + 1)
  location            = azurerm_resource_group.adds.location
  resource_group_name = azurerm_resource_group.adds.name

  network_interface_ids = [azurerm_network_interface.main[count.index].id]

  size                = var.ad_machine_sku

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

### For Each Lists

You could always use a ``for_each`` list and create a bunch of resources based on a set\map. This can be used in more complicated scenarios for creating multiple resources.

The example below created Backup Policies using a Map style variable. This has a "Key" that is used in the instance reference and then multiple values in the map. The advantage of using this method is uniqueness is not so much of a problem as you can place uniqueness in the key and use that as the name.

#### Inside Module - main.tf

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

#### Inside Module - terraform.tfvars

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

## Repeatability of a Module

The repeatability of the module is probably the most important part, the most common example of module repeating that I can think of is when you want multiple regions (there are many other reasons but pretty sure this would be the most common). For me this discounts the possibility of using Count and only makes sense to use a ``for_each`` loop with a map as the example below.

### Modules - main.tf

```hcl
module "hub" {
  for_each = var.hubs

  source = "git::https://dev.azure.com/rawritscloud/TerraformModules/_git/terraform-azurerm-hub?ref=v1.0.0"

  location           = each.key
  hub_address_prefix = each.value["hub_address_prefix"]
```

### Modules - terraform.tfvars

```hcl
hubs = {
    uksouth = {
      hub_address_prefix    = "10.100.0.0/23"
    },
    ukwest = {
      hub_address_prefix    = "10.101.0.0/23",
    }
}
```
