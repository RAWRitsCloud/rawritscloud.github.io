---
# Feel free to add content and custom Front Matter to this file.
# To modify the layout, see https://jekyllrb.com/docs/themes/#overriding-theme-defaults

layout: main
---
# A Cloud guy just blogging his journey
RAWR (that means Hi in Dinosaur), I'm James...I'm just a guy blogging cloud and hopefully dropping some useful information along the way!

{% for post in site.posts %}
## [{{ post.title }}]({{ post.url }})
Category: {{ post.categories }}
{{ post.excerpt }}
{% endfor %}
