---
layout: post
title:  "How do I blog? And how do I automate some of it!"
author: james
date: 2022-09-16 00:01 +0000
tags: [Automation, GitHub, Pipelines, GitHubActions, LogicApps]
categories: [Blogging, Automation]
image: assets/images/posts/automating-your-blog.jpg
description: "An article about how I blog and how I automate some of my social media actions for the blog."
excerpt: "An article about how I blog and how I automate some of my social media actions for the blog."
featured: true
coverattribute: Photo by <a href="https://unsplash.com/@etiennegirardet?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Etienne Girardet</a> on <a href="https://unsplash.com/s/photos/writing?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Unsplash</a>
  
---

If you run a technical blog, you've probably wrestled with three things: where to host it, how to handle draft scheduling, and how to get posts in front of people on social media without doing it entirely by hand. I've tried most of the popular platforms and landed on a setup that works well for me — GitHub Pages for hosting, GitHub Actions for scheduling, and an Azure Logic App to tie the social media side together.

This article covers how the whole thing fits together, including the YAML and JSON snippets you'd need to replicate it.

---

## Blog Hosting

There are a lot of platforms to blog on — I think I've used most of them, from Blogger and WordPress to GoDaddy's own blogging software. I've landed on GitHub Pages because I can write everything in Markdown, which is what I use day-to-day at work anyway.

There are pitfalls. Drafts aren't handled natively in Jekyll, and social media distribution — Facebook and Workplace in particular — is more manual than I'd like. But the upside is I'm writing this in VS Code, which I already know well, and code snippets work perfectly. That was the biggest pain point with every other platform I tried.

Getting started with GitHub Pages is well documented, so I'll skip the basics. Head to [GitHub Pages](https://pages.github.com/) and look for "Blogging with Jekyll" at the bottom. I've got a custom domain pointed at mine and picked my own theme from there.

## Drafts

Jekyll has no built-in publishing schedule — unlike WordPress, there's no "publish at 9am" option. I rely on GitHub Actions for this, triggered by an Azure Logic App rather than a cron schedule directly. I tried the cron approach first and found it unreliable enough that I switched.

The GitHub Action itself is simple — I found the core of it on someone else's blog (I genuinely cannot remember whose). The YAML is below.

```yaml
name: Publish Blog Drafts

on:
  workflow_dispatch:
  
jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v1
    - name: Jekyll Publish Drafts
      uses: soywiz/github-action-jekyll-publish-drafts@v2
      with:
        github_token: ${{ secrets.GITHUB_TOKEN }}
        jekyll_path: ./
        branch: gh-pages
```

I keep a `_drafts` folder in my repository. Each Markdown post has a date in its front matter, and this action reads that date and moves posts to `_posts` when the day arrives. The time component is always the same — it's not the actual publish time, just a consistent marker.

The clever bit is using `workflow_dispatch` rather than a schedule, because that lets you trigger the action externally via the GitHub API.

### Logic App

The Logic App I host in Azure costs less than 1p a month to run daily. It triggers at 6pm with a simple Recurrence. The full template is in my [Git repo](https://github.com/RAWRitsCloud/blog-content/tree/main/automating-your-blog) — I've broken it into relevant snippets below.

```json
"triggers": {
  "Recurrence": {
    "recurrence": {
      "frequency": "Day",
      "interval": 1,
      "schedule": {
        "hours": ["18"],
        "minutes": [0]
      },
      "timeZone": "GMT Standard Time"
    },
    "type": "Recurrence"
  }
}
```

Then a step to trigger the GitHub Action via the API. You'll need a PAT token for the `AUTHKEY` — set whatever expiry you're comfortable with, it only needs the `public_repo` scope.

![Permission Screenshot](/assets/images/posts/assets/automating-your-blog-permission-screenshot.png)

This targets the `gh-pages` branch — which is what the GitHub Pages guide will set you up with too. In practice the PAT token should come from Key Vault rather than being hardcoded; I've removed that reference here for simplicity.

```json
"Run_the_drafts_workflow_in_Github": {
  "type": "Http",
  "inputs": {
    "body": {
      "ref": "gh-pages"
    },
    "headers": {
      "authorization": "Bearer AUTHKEY"
    },
    "method": "POST",
    "uri": "https://api.github.com/repos/GITUSER/GITPAGEURL.github.io/actions/workflows/publish_drafts.yml/dispatches"
  }
}
```

## Social Media

Social media is how I distribute posts — and probably how you ended up here. Getting content out across multiple channels automatically is where the Logic App earns its keep.

I use the same Logic App to post to Twitter and LinkedIn. There's no easy plugin for Facebook Pages or Workplace, so I use [Zapier](https://zapier.com/) for Facebook. One difference I noticed: LinkedIn escapes spaces in URLs automatically when called from a Logic App — Twitter does not. That led me to use Short.io with my own short domain (`rawrits.cloud`) to normalise URLs across platforms before posting.

The Logic App reads my RSS feed (Jekyll builds one for the last 10 posts), filters to articles published in the last day, and posts each one. Variables extract hashtags and the short URL so the same values can go to multiple networks in parallel.

```json
"Get_Website_Feed": {
  "type": "ApiConnection",
  "inputs": {
    "host": {
      "connection": {
        "name": "@parameters('$connections')['rss']['connectionId']"
      }
    },
    "method": "get",
    "path": "/ListFeedItems",
    "queries": {
      "feedUrl": "https://www.blogurl.com/feed.xml",
      "sinceProperty": "PublishDate"
    }
  }
},
"Filter_to_Last_day": {
  "type": "Query",
  "inputs": {
    "from": "@body('Parse_RSS_Feed')",
    "where": "@greaterOrEquals(item()['publishDate'], addDays(utcNow(), -1))"
  }
}
```

Then post to each network in parallel:

```json
"Post_a_tweet": {
  "type": "ApiConnection",
  "inputs": {
    "host": {
      "connection": {
        "name": "@parameters('$connections')['twitter']['connectionId']"
      }
    },
    "method": "post",
    "path": "/posttweet",
    "queries": {
      "tweetText": "@{items('Item_Loop')?['title']} @{variables('hashtags')} @{variables('primaryLinkUri')}"
    }
  }
},
"Share_an_article_V2": {
  "type": "ApiConnection",
  "inputs": {
    "body": {
      "content": {
        "content-url": "@variables('primaryLinkUri')",
        "title": "@items('Item_Loop')?['title']"
      },
      "distribution": {
        "linkedInDistributionTarget": {
          "visibleToGuest": true
        }
      },
      "text": {
        "text": "@{items('Item_Loop')?['summary']} @{variables('hashtags')}"
      }
    },
    "host": {
      "connection": {
        "name": "@parameters('$connections')['linkedinv2']['connectionId']"
      }
    },
    "method": "post",
    "path": "/v2/people/shares"
  }
}
```

For Facebook, Zapier handles it on the free tier. The paid tier would let you consolidate everything into Zapier, but it's not worth it for the volume a personal blog generates.

![Zapier Screenshot](/assets/images/posts/assets/automating-your-blog-zapier.png)

## Common Mistakes

**Using a GitHub Actions cron schedule for draft publishing.** They're unreliable for Jekyll draft promotion — I burned time on this. An external trigger via the API (as above) is far more consistent.

**Hardcoding your GitHub PAT in the Logic App.** Always pull secrets from Key Vault. The Logic App Key Vault connector is straightforward to add and means you're not rotating a hardcoded token when it expires.

**Not accounting for URL encoding on Twitter.** LinkedIn handles it for you; Twitter doesn't. If your post URLs contain spaces or special characters, they'll break on Twitter unless you encode them first or use a short URL service.

**Expecting Zapier's free tier to cover everything.** The free tier is enough for Facebook if you're only posting once a day, but it won't handle complex multi-step flows. Know its limits before you rely on it.

## Summary

GitHub Pages with Jekyll is a solid blogging platform if you're comfortable in VS Code and Markdown. The draft scheduling gap is real but fillable: a `workflow_dispatch` GitHub Action triggered by an Azure Logic App costs almost nothing and works reliably. For social media, the Logic App handles Twitter and LinkedIn, and Zapier covers Facebook on the free tier. The short URL step is worth adding if you're posting to Twitter.

## What to Explore Next

- [GitHub Pages](https://pages.github.com/) — getting started with Jekyll hosting
- [Terraform Docs](https://terraform-docs.io/) — same pipeline pattern applied to module documentation
- [Short.io](https://short.io/) — API-driven short link creation for social sharing
- [Zapier](https://zapier.com/) — free-tier social automation for platforms without Logic App connectors
