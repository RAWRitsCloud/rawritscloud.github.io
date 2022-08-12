---
layout: post
title:  "Terraform Modules, what are they?"
author: james
date: 2022-08-19 00:01 +0000
tags: [IaC, Templates, Terraform]
categories: [Terraform Modules]
image: assets/images/posts/lets-talk-modules.jpg
description: "An overview of Terraform modules and talking about processes around them."
excerpt: "An overview of Terraform modules and talking about processes around them."
featured: true
coverattribute: Photo by <a href="https://unsplash.com/@sigmund?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Sigmund</a> on <a href="https://unsplash.com/s/photos/jigsaw?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Unsplash</a>
---
## What is a Module?

Modules is one of the buzzwords you hear around Terraform and for good reason! Modules are a folder for all intensive purposes that contain your everyday Terraform code, however they serve a different purpose to your normal Terraform files as there aim to be deployed in a repetable fashion.

An excellent example of a module is the Microsoft Enterprise Scale\Landing Zones Module that I've talked about on this blog before. That deploys Policy and Management in Microsofts recommended pattern but at the same time allows you to complete customise almost every aspect of it.

Another example from BT is we have a module to deploy the Service Desk Monitoring items which include Policy assignments, Alerts, Logic Apps, Roles, Key Vaults, Log Analytics Gateway and Monitoring configuration profile for SQL Insights.

## Process around a module

As with everything you need some process to make sure your modules are needed and wanted. I always like to start a Terraform module by going through some simple steps:

- Gather Requirements for the Modules from the User
- Create a Requirements Document for the Module
  - Define High-level resources
  - Discover Parent module dependencies
- Circle the Requirements document to the users
- Create a Design Document for the Module
  - Define Low-level resources
  - Define Outputs of the module
  - Define "Parent" Modules and how I will consume Outputs from the Parent
  - Define State Location
  - Define where loops happen (inside the module or the whole module)
- Circle the Design document to the users
- Create Git Repo from Template (we'll talk about that in a later blog!)

With these simple steps what you will have is a rich documentation library that can be turned into Markdown pages and logged within the module itself or as Word Documents kept in your collaboration envrionment (like Teams or Confluence). 

By implementing the processes you are showing value to the business and how they will help your business units moving forward, if that is to implement a module via a Service Desk ticket or Consultancy Projects.

## Module Sprawl

Creating a module is easy enough and I'm sure you will soon have a library of 100's, however like many thinks you might suffer with module sprawl. I've seen modules created that only include 1 resource making it a very pointless module in my option.

It's important to ensure that you create modules that are actually needed are performing a function that is actually needed and will deliver value to your business. The steps above should hopefully combat too much module sprawl.
