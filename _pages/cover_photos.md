---
layout: page
title: Photo Credits
permalink: /photocredits
---

All the photos used on this site are obtained from [Unsplash](https://unsplash.com), the internet’s source of freely-usable images.

Each Post contains the attribution tag in its metadata and is available in the list below.

- Jumbotron at the Bottom of every Page - Photo by [Justin Clark](https://unsplash.com/@imjustintime?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText) on [Unsplash](https://unsplash.com/s/visual/d7db2a3c-93aa-483c-be7e-5c8095cde455?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText)

{% for post in site.posts %}

- [{{ post.title }}]({{ post.url }}) - {{ post.coverattribute }}

{% endfor %}
