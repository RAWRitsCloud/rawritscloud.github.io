---
layout: post
title:  "template draft"
author: james
date: 2022-09-23 00:01 +0000
tags: [CostManagement, Automation, LogicApps, ARM, PIP, Disks, Snapshots]
categories: [Automation, Azure, CostManagement]
image: assets/images/posts/cost-managment-logic-apps.jpg
description: "A few logic apps to help control costs of Disks and Public IP addresses."
excerpt: "A few logic apps to help control costs of Disks and Public IP addresses. Can easily be changed to support more resources!!"
featured: true
coverattribute: Photo by <a href="https://unsplash.com/@ameliaspink?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Amelia Spink</a> on <a href="https://unsplash.com/s/photos/coins?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Unsplash</a>
  
---
## Controlling costs in Azure

Controlling the costs in Azure can be a challenge, Microsoft have done a brilliant job of showing how you spend your money with their cost analysis features however there appears to be some gaps in the Azure Advisor to some of the resources. One of these omissions is Unused Public IP Addresses and Unattached disks only show up after 30 days of being unattached. The alerts in Azure Advisor I've also found to be hit and miss when new resources are being added into an already existing recommendation as well as they alert is on "New recommendation".

## Logic Apps

I've looked at creating 2 Logic Apps that in this example allow you log the unused resources into Log Analytics, however you could do something more interesting like Add a Tag to the resource so if it runs twice it can delete the resources automatically or send an approval e-mail before deleting etc maybe even just raise an ticket in your service desk software.

The Logic apps uses the ARM connecter using a Managed Identity so the Logic App will need to be given permissions over the relevant resources. The Logic app code can be found in my github [here](https://github.com/RAWRitsCloud/blog-content/tree/main/cost-managment-logic-apps).

### Unattached Public IP Address Flow Chart

![Unattached Public IP Address Flow Chart](/assets/images/posts/assets/cost-managment-logic-apps-pipla.svg)

### Unattached Disks Flow Chart

![Unattached Disks Flow Chart](/assets/images/posts/assets/cost-managment-logic-apps-diskla.svg) 

## Assign Logic App Permissions to Subscription

After the logic apps are created you will need to assign them some RBAC roles, I suggest the PIP Logic App holds ``Network Contributor`` and the disk to hold ``Virtual Machine Contributor``.

![This is an image](/assets/images/posts/assets/cost-managment-logic-apps-rbac.png)
