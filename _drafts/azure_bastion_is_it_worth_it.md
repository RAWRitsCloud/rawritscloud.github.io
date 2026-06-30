---
layout: post
title: "Azure Bastion: Is It Worth It?"
date: 2026-07-24 00:00:00 +0000
categories: [Azure]
tags: [Azure Bastion, Azure Networking, Azure Virtual Machines, Terraform, Security]
author: james
excerpt: "Azure Bastion provides secure browser-based RDP and SSH access to Azure virtual machines without exposing management ports. Here's when it's worth paying for, when it isn't, and how I deploy it in enterprise Azure environments."
---

# Azure Bastion: Is It Worth It?

If you've ever inherited an Azure environment, there's a fair chance you've found TCP 3389 or 22 open to the internet with an NSG rule that reads something like **"Temporary Management Access"**. Six months later it's still there, nobody remembers adding it, and everyone is pretending it doesn't exist.

Remote access is one of those problems that's easy to solve badly. Developers need access to virtual machines, operations teams need to troubleshoot issues, and security teams quite reasonably don't want internet-facing management ports sitting around waiting to be discovered.

Azure Bastion is Microsoft's answer to that problem. It promises browser-based RDP and SSH access without exposing your VMs directly to the internet. On paper it sounds ideal, but it also isn't free, and depending on your environment it can feel surprisingly expensive.

I've deployed Bastion across multiple enterprise Azure Landing Zones, and I've also worked in environments where it simply wasn't the right choice. This article looks at what Azure Bastion actually does, how the different SKUs compare, where it fits against VPNs and jump boxes, and whether it's worth the monthly bill.

---

## What Azure Bastion Actually Does

Azure Bastion acts as a managed jump host that Microsoft operates for you.

Instead of connecting directly to your VM over RDP or SSH, you connect to the Azure portal or native client, which establishes a TLS session to the Bastion service. Bastion then connects privately to your virtual machine over the virtual network.

The important difference is that **your VM never requires a public IP address or inbound RDP/SSH ports**.

That immediately removes one of the biggest attack surfaces found in Azure environments.

### The connection flow

```
Administrator
      │
 HTTPS/TLS (443)
      │
Azure Portal / Native Client
      │
Azure Bastion
      │
Private Virtual Network
      │
Virtual Machine
```

Your VM remains entirely private whilst still being manageable.

For organisations working towards Zero Trust principles, that's a much nicer place to be than maintaining a collection of jump boxes.

---

## Basic, Standard and Premium — Which One Should You Choose?

Microsoft has steadily expanded Bastion over the years, and the SKU choice matters more than many people realise.

| Feature | Basic | Standard | Premium |
|---------|--------|----------|----------|
| Browser RDP/SSH | ✅ | ✅ | ✅ |
| Native Client Support | ❌ | ✅ | ✅ |
| File Transfer | ❌ | ✅ | ✅ |
| Session Recording | ❌ | ❌ | ✅ |
| IP-based Connections | ❌ | ✅ | ✅ |
| Shareable Links | ❌ | ✅ | ✅ |

### Basic

Basic exists primarily for organisations that simply want secure browser-based access.

It works, but you'll quickly hit limitations if engineers prefer native RDP clients or need file transfer.

I've seen several organisations deploy Basic to save money only to replace it six months later.

### Standard

For most production environments, Standard is where I'd start.

Native client support alone makes a huge difference to day-to-day administration, especially if your support teams spend hours inside remote sessions.

The additional management features also make life considerably easier.

### Premium

Premium introduces session recording and additional enterprise security capabilities.

If you're operating in regulated industries where administrative sessions need auditing, Premium starts making sense.

Otherwise, Standard is usually the sweet spot.

---

## Is Azure Bastion Worth the Cost?

This is the question everyone asks.

Azure Bastion isn't particularly expensive in isolation, but it also isn't something you deploy for a single development VM without thinking about it.

The cost comes from:

- Bastion hourly charges
- Data transfer
- Public IP
- Additional scaling where required

For a small lab environment, that's often difficult to justify.

For an enterprise Landing Zone with dozens or hundreds of virtual machines, the calculation changes completely.

### Compare the alternatives

| Option | Pros | Cons |
|---------|------|------|
| Azure Bastion | No public VM access, managed service, low maintenance | Ongoing monthly cost |
| Jump Box | Familiar approach | Patch management, public exposure, maintenance |
| VPN | Good for internal access | More operational overhead, broader network access |
| Just-in-Time VM Access | Free, reduces exposure | Ports still open temporarily |

Personally, I don't view Bastion as competing with VPN.

VPN provides network connectivity.

Bastion provides **secure administrative access**.

Those solve different problems.

---

## Bastion in a Hub-and-Spoke Landing Zone

Most enterprise Azure environments I work with follow a hub-and-spoke architecture.

That naturally lends itself to a shared Bastion deployment.

```
                Internet
                    │
             Azure Bastion
                    │
             Hub Virtual Network
          ┌─────────┴─────────┐
          │                   │
      Spoke A             Spoke B
          │                   │
         VM1                VM2
```

Rather than deploying Bastion into every spoke network, you deploy it once into the hub and peer your VNets appropriately.

That keeps costs sensible whilst giving administrators access across the environment.

The biggest mistake I see is forgetting that Bastion relies on correct VNet peering.

If peering isn't configured correctly, Bastion isn't magically going to reach your workloads.

---

## Deploying Azure Bastion with Terraform

Deployment is refreshingly straightforward once your networking is in place.

The biggest requirement is creating an **AzureBastionSubnet**.

Microsoft requires this subnet name exactly, and today it should be at least **/26** for production deployments.

```hcl
resource "azurerm_subnet" "bastion" {
  name                 = "AzureBastionSubnet"
  resource_group_name  = azurerm_resource_group.hub.name
  virtual_network_name = azurerm_virtual_network.hub.name
  address_prefixes     = ["10.0.0.0/26"]
}

resource "azurerm_public_ip" "bastion" {
  name                = "pip-bastion"
  resource_group_name = azurerm_resource_group.hub.name
  location            = azurerm_resource_group.hub.location
  allocation_method   = "Static"
  sku                 = "Standard"
}

resource "azurerm_bastion_host" "hub" {
  name                = "bas-hub"
  resource_group_name = azurerm_resource_group.hub.name
  location            = azurerm_resource_group.hub.location
  sku                 = "Standard"

  ip_configuration {
    name                 = "configuration"
    subnet_id            = azurerm_subnet.bastion.id
    public_ip_address_id = azurerm_public_ip.bastion.id
  }
}
```

That isn't the entire deployment, but it's enough to illustrate the key components.

In production I'd normally wrap this into a reusable Terraform module so every Landing Zone follows the same deployment pattern.

---

## Connecting with Azure CLI

Once Bastion is deployed, connecting is straightforward.

```powershell
az network bastion ssh `
    --name bas-hub `
    --resource-group rg-network `
    --target-resource-id "/subscriptions/<subscription-id>/resourceGroups/rg-workloads/providers/Microsoft.Compute/virtualMachines/vm-app01" `
    --auth-type AAD
```

If you're using Microsoft Entra ID authentication alongside Conditional Access, this becomes an excellent combination.

Instead of relying solely on VM credentials, you're layering identity controls on top of network controls.

That's exactly where modern Azure security should be heading.

---

## Don't Forget Network Security Groups

One misconception I still hear is:

> "We've deployed Bastion so we don't need NSGs anymore."

Unfortunately, no.

Bastion reduces your exposure.

It doesn't replace sensible network segmentation.

A typical workload subnet might still look something like:

```text
Allow:
- Virtual Network
- Azure Load Balancer
- Required application traffic

Deny:
- Internet inbound
- RDP (3389) from Internet
- SSH (22) from Internet
```

The difference is that Bastion communicates privately inside your virtual network rather than requiring public management ports.

---

## Common Mistakes

I've either made, fixed or inherited every one of these.

**Deploying Basic because it's cheaper.**  
If your operations team expects native client support, you'll probably end up upgrading later anyway.

**Using a subnet that's too small.**  
The `AzureBastionSubnet` should be at least **/26**. Planning for growth now is much easier than redesigning your hub later.

**Forgetting VNet peering.**  
Bastion only reaches what your networking allows. Check peering, routing and security before assuming Bastion is broken.

**Treating Bastion as an identity solution.**  
Bastion secures connectivity. You still need Microsoft Entra ID, Conditional Access, least privilege and good operational practices.

**Deploying one Bastion per workload.**  
Unless there's a genuine isolation requirement, a shared hub deployment is usually far more cost-effective.

---

## Summary

Azure Bastion solves a genuine security problem without introducing much operational overhead. Removing public RDP and SSH access from your virtual machines is one of those improvements that pays for itself surprisingly quickly.

For most organisations, **Standard SKU** offers the best balance between capability and cost. Basic feels limited for long-term use, whilst Premium mainly targets environments with stricter compliance requirements.

If you're already building hub-and-spoke Azure Landing Zones, Bastion fits naturally into that architecture. Just remember that it's one layer of your security model, not the whole thing.

Like many Azure services, the question isn't whether it's good. The question is whether it solves a problem you actually have. In larger enterprise environments, I'd argue it usually does.

---

## What to Explore Next

- **Azure Virtual Networks Explained** — understanding hub-and-spoke networking.
- **Managed Identities Explained** — reducing credential management inside Azure.
- **Network Security Groups vs Azure Firewall** — choosing the right security controls.
- Microsoft Learn: Azure Bastion deployment and architecture guidance.
- Terraform AzureRM Provider documentation for `azurerm_bastion_host`.

---

## Final Thoughts

I've spent enough time cleaning up legacy jump servers to appreciate what Azure Bastion brings to the table. Is it perfect? No. Is it cheaper than doing nothing? Definitely not.

But if it lets you remove public management ports, retire ageing jump boxes, and simplify secure administration across your Landing Zones, it's usually money well spent. Sometimes the most valuable infrastructure is the infrastructure nobody notices because it quietly removes an entire class of problems.

If you found this article useful, feel free to connect with me on LinkedIn, explore the code examples in my GitHub repositories, and check out more Azure, Terraform and automation content here on **RAWRitsCloud**.