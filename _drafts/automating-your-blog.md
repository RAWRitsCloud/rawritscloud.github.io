---
layout: post
title:  "How do I blog? And how do I Automate some of it!"
author: james
date: 2022-09-16 00:01 +0000
tags: [GitHub, Pipelines, GitHubActions, LogicApps]
categories: [Blogging, Automation]
image: assets/images/posts/automating-your-blog.jpg
description: "An article about how I blog and how I automate some of my social media actions for the blog."
excerpt: "An article about how I blog and how I automate some of my social media actions for the blog."
featured: true
coverattribute: Photo by <a href="https://unsplash.com/@etiennegirardet?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Etienne Girardet</a> on <a href="https://unsplash.com/s/photos/writing?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText">Unsplash</a>
  
---
## Blog Hosting

As we all know especially if you have landed here there are many many platforms to blog on, I think I've used most of them from Blogger, WordPress to GoDaddy’s own Blogging software but I have finally landed on GitHub pages. The reason for me landing on Github pages is that I could use Markdown which I use very regularly in my everyday job.

I had an appreciation for how to blog on it and at first it seemed like a good idea (there have been pitfalls!). One of the major pitfalls is drafts for me, I found workarounds which I will talk about, but it is not the prettiest solution in the world. The other one is Social Media pushing and I still to this day have to do some manual pushing to the wonderful Meta platforms (Facebook, Workplace and Instagram).

However, I have found GitHub pages overall to be the best for me, I like I'm typing this article in VSCode which is familiar to me and I understand how it will render and I know 100% it will support code snippets which was the biggest problem for me with all the other platforms.

It's pretty easy to get started with hosting a GitHub pages and I'm not going to recycle the content so head to [GitHub Pages](https://pages.github.com/) and if you want to learn how to Blog its down the Bottom saying "Blogging with Jekyll". I have a custom domain name linked to my GitHub Pages and then went and found my own themes (Credit for the theme in the bottom of every page!).

## Drafts

Drafts, so there is no default content publishing schedule built into Jekyll\GitHub Pages like there is with WordPress etc. so I rely on GitHub Actions to do this, I started off with a GitHub actions with a CRON Schedule however I didn't find this overly reliable and it didn't solve the social media problem I had so I still use a GitHub Action however I run it using a Azure Logic App and a "dispatcher" trigger.

My GitHub action is nothing to write home about and I found on someone else’s blog post (I cannot remember who's though!). The YAML for the GitHub action is below.

```yml
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

I have a ``_drafts`` folder in my repository and each Markdown post has a Date component to it which this action interprets the date and then moves it to the ``_posts`` folder at the right date. I always have the time set to the same time but it's not the actual time the article is published.

The clever but is dealing with the ``workflow_dispatch`` action which you can trigger using the GitHub API.

### Logic App

The logic App I host in Azure costs less than a 1p a month to run every single day, I have a simple Trigger at 6pm. I've uploaded the full template to a [Git Repo](https://github.com/RAWRitsCloud/blog-logic-app/blob/main/README.md), however I've snipped it up into little bits in this blog.

```json
   "triggers":{
      "Recurrence":{
         "evaluatedRecurrence":{
            "frequency":"Day",
            "interval":1,
            "schedule":{
               "hours":[
                  "18"
               ],
               "minutes":[
                  0
               ]
            },
            "timeZone":"GMT Standard Time"
         },
         "recurrence":{
            "frequency":"Day",
            "interval":1,
            "schedule":{
               "hours":[
                  "18"
               ],
               "minutes":[
                  0
               ]
            },
            "timeZone":"GMT Standard Time"
         },
         "type":"Recurrence"
      }
   }
```

Then a simple step to use the GitHub API to run the GitHub Action. You will need to generate a PAT token from GitHub for the ``AUTHKEY`` and set this to whatever expiration you are comfortable with, it only needs one Permission which is the ``public_repo`` permission.

![Permission Screenshot](/assets/images/posts/assets/automating-your-blog-permission-screenshot.png)

This is targeting a branch called gh-pages which if you follow the GitHub article will be the branch that you use as well for your site deployment. For simplicity I have removed the Key Vault that I use in the Logic App but you should be able to replicate this and get the AUTHKEY from a Key Vault.

```json
   "Run_the_drafts_workflow_in_Github":{
      "runAfter":{
         
      },
      "type":"Http",
      "inputs":{
         "body":{
            "ref":"gh-pages"
         },
         "headers":{
            "authorization":"Bearer AUTHKEY"
         },
         "method":"POST",
         "uri":"https://api.github.com/repos/GITUSER/GITPAGEURL.github.io/actions/workflows/publish_drafts.yml/dispatches"
      }
   }
```

That's it really from the GitHub automation part of it, this fires the Action reliably but as mentioned above the other parts to automate was the Socials.

## Social Media

Social media is the way I distribute my Blog posts and arguably it probably how you ended up here today. Getting your posts out to all your social media channels can be a trick in its own with GitHub Pages, I continue to use the Logic App to post to Twitter and LinkedIn however there is no easy plugin for Facebook Pages or Workplace (I wouldn't expect one for Workplace to be honest but I would for Facebook!) so I use [Zapier](https://zapier.com/) to push to my Facebook page.

One of the differences I noticed between Twitter and LinkedIn though is that how it deals with spaces in URLs when using a Logic App. LinkedIn rather nicely escapes the link for you, Twitter DOES NOT! This has led me to use Short.io and create a Short Link with my own Customer Short DNS (rawrits.cloud), using their API which you will see in the full Logic App I can send the same URL to different Platforms.

So let’s dig into the rest of the Logic App, part of my site is that it builds and RSS feed for the last 10 posts. I pull this into the Logic App and then Filter to articles that are 1 day or less old (hopefully a draft has just been published).

```json
   "Get_Website_Feed":{
      "runAfter":{
         "Delay":[
            "Succeeded"
         ]
      },
      "type":"ApiConnection",
      "inputs":{
         "host":{
            "connection":{
               "name":"@parameters('$connections')['rss']['connectionId']"
            }
         },
         "method":"get",
         "path":"/ListFeedItems",
         "queries":{
            "feedUrl":"https://www.blogurl.com/feed.xml",
            "sinceProperty":"PublishDate"
         }
      },
      "Parse_RSS_Feed":{
         "runAfter":{
            "Get_Website_Feed":[
               "Succeeded"
            ]
         },
         "type":"ParseJson",
         "inputs":{
            "content":"@body('Get_Website_Feed')",
            "schema":{
               "items":{
                  "properties":{
                     "categories":{
                        "items":{
                           "type":"string"
                        },
                        "type":"array"
                     },
                     "copyright":{
                        "type":"string"
                     },
                     "id":{
                        "type":"string"
                     },
                     "links":{
                        "items":{
                           "type":"string"
                        },
                        "type":"array"
                     },
                     "primaryLink":{
                        "type":"string"
                     },
                     "publishDate":{
                        "type":"string"
                     },
                     "summary":{
                        "type":"string"
                     },
                     "title":{
                        "type":"string"
                     },
                     "updatedOn":{
                        "type":"string"
                     }
                  },
                  "required":[
                     "id",
                     "title",
                     "primaryLink",
                     "links",
                     "updatedOn",
                     "publishDate",
                     "summary",
                     "copyright",
                     "categories"
                  ],
                  "type":"object"
               },
               "type":"array"
            }
         }
      },
      "Filter_to_Last_2_days":{
         "runAfter":{
            "Parse_RSS_Feed":[
               "Succeeded"
            ]
         },
         "type":"Query",
         "inputs":{
            "from":"@body('Parse_RSS_Feed')",
            "where":"@greaterOrEquals(item()['publishDate'], addDays(utcNow(), -1))"
         }
      }
   }
```

Then we simply string it all together (I use variables which you will see in the full one to extract Hashtags etc.) and then publish it to each of the networks, I do these as a parallel task.

```json
   "Post_a_tweet":{
      "type":"ApiConnection",
      "inputs":{
         "host":{
            "connection":{
               "name":"@parameters('$connections')['twitter']['connectionId']"
            }
         },
         "method":"post",
         "path":"/posttweet",
         "queries":{
            "tweetText":"@{items('Item_Loop')?['title']} @{variables('hashtags')} @{variables('primaryLinkUri')}"
         }
      }
   },
   "Set_primaryLinkUri":{
      "runAfter":{
         "Parse_Short_Link_JSON":[
            "Succeeded"
         ]
      },
      "type":"SetVariable",
      "inputs":{
         "name":"primaryLinkUri",
         "value":"@body('Parse_Short_Link_JSON')?['secureShortURL']"
      }
   },
   "Share_an_article_V2":{
      "type":"ApiConnection",
      "inputs":{
         "body":{
            "content":{
               "content-url":"@variables('primaryLinkUri')",
               "title":"@items('Item_Loop')?['title']"
            },
            "distribution":{
               "linkedInDistributionTarget":{
                  "visibleToGuest":true
               }
            },
            "text":{
               "text":"@{items('Item_Loop')?['summary']} @{variables('hashtags')}"
            }
         },
         "host":{
            "connection":{
               "name":"@parameters('$connections')['linkedinv2']['connectionId']"
            }
         },
         "method":"post",
         "path":"/v2/people/shares"
      }
   }
```

Then the final step to get the post to publish to Facebook Pages is to use [Zapier](https://zapier.com/), now I'm on the Free tier of [Zapier](https://zapier.com/) but when I was on the trial it was far easier to do all the social media posting exclusively through [Zapier](https://zapier.com/) but it’s not worth the money in my option just for my little blog!

![Zapier Screenshot](/assets/images/posts/assets/automating-your-blog-zapier.png)

I hope you have enjoyed this little article about how I blog!
