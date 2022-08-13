---
layout: post
title:  "Terraform Modules, initial design patterns"
author: james
date: 2022-08-26 00:01 +0000
tags: [IaC, Templates, Terraform]
categories: [Terraform Modules]
image: assets/images/posts/modules-design-patterns.jpg
description: "Talking about some of the take aways from my experience of building Terraform modules."
excerpt: "Talking about some of the take aways from my experience of building Terraform modules."
featured: true
coverattribute: Photo by <a href="https://unsplash.com/@medbadrc?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Med Badr  Chemmaoui</a> on <a href="https://unsplash.com/s/photos/design?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Unsplash</a>
  
---
## Storing Private Modules

When you are building modules its always good to think about making them available on the Terraform Modules directory however we all know that simply isn't practical especially if that might form some sort of IP for your product/service that your business offers.

The answer on where to store them though is dependant on your Source Control systems, the way we do it at BT is using our Azure DevOps instance. We have a single Project with multiple Git repos that store each module. 

This pattern doesn't work in GitHub of course and would just be independent repos in GitHub or you could create a single Repo with a folder structure for each module.

## Repeatability

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

#### Resource

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

#### Map Variable Value

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
