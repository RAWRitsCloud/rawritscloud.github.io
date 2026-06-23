---
layout: null
sitemap: false
---
{% assign counter = 0 %}
var documents = [
{% for post in site.posts %}
{
  "id": "{{ counter }}",
  "url": "{{ site.baseurl }}{{ post.url }}",
  "title": {{ post.title | jsonify }},
  "categories": {{ post.categories | join: ', ' | jsonify }},
  "body": {{ post.content | markdownify | strip_html | strip_newlines | normalize_whitespace | jsonify }}
}{% assign counter = counter | plus: 1 %}{% unless forloop.last %},{% endunless %}
{% endfor %}
];
