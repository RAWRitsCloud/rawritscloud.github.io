---
layout: post
title:  "Terraform Modules, organising the modules"
author: james
date: 2022-08-26 00:01 +0000
tags: [IaC, Templates, Terraform, Git, Design]
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

## File Names

One that will be debated for the ages but I will give my thoughts around file names. Many Terraform purists would say you have ``main.tf, variables.tf`` and ``outputs.tf`` and personally I agreed with this approach until I started working with people who are not so familiar with Terraform.

I've come to realise you should try and separate the Resources up at minimum. At my work place we prefix all the files with ``res-`` and if we need to break up variables we do ``var-``. The Resources files are then named something like ``res-virtualmachines.tf`` or ``res-resourcegroups.tf``. We've not had a reason to split the Variables up next but we have the naming standard there. 

We maintain the ``outputs.tf`` and we use ``versions.tf`` for Provider configuration.

## Repetition

I will talk about repetition in another model however a note needs to be in the design thoughts as you should be designing modules to key scenarios such as Multi-Region or using a CSV maybe for very complex loops.

## State Files

State files are so important to plan when you are designing modules. You need to consider how your module interacts with other modules and are those other modules in a different state.

In my workplace we store state centrally in a Storage account in the Management Subscription in a single container and then we split it up according to the Management groups found in Enterprise scale, so we would create the following states:

- connectivity.tfstate
- management.tfstate
- identity.tfstate
- application_landing_zone_1.tfstate
- application_landing_zone_2.tfstate
- application_landing_zone_etc.tfstate

This allows us to easily use a Remote State data component across the different modules/subscriptions.
