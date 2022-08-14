---
layout: post
title:  "Terraform Modules, organising the modules"
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

