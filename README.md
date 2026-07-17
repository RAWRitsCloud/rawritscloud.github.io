# RAWRitsCloud

![RAWRitsCloud logo](assets/images/logo.png = 250x)

Practical articles about Microsoft Azure, Terraform, cloud automation and cost optimisation.

[Visit RAWRitsCloud](https://www.rawritscloud.com) · [Browse articles](https://www.rawritscloud.com/articles) · [View certifications](https://www.rawritscloud.com/certifications)

[![Deploy Jekyll site to Pages](https://github.com/RAWRitsCloud/rawritscloud.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/RAWRitsCloud/rawritscloud.github.io/actions/workflows/deploy.yml)
[![Website status](https://img.shields.io/website?url=https%3A%2F%2Fwww.rawritscloud.com\&label=website)](https://www.rawritscloud.com)

## About

**RAWRitsCloud** is the personal cloud technology blog of **James Murray-Ferris**, a Cloud Solutions Consultant working primarily with Microsoft Azure.

The site shares practical guides, technical patterns, lessons learned and the occasional solution to something that should probably have been easier.

Topics include:

* Microsoft Azure architecture and governance
* Terraform and infrastructure as code
* Cloud automation
* GitHub Actions
* Azure cost management and optimisation
* Identity, networking and security
* Technical certifications and continuous learning

## Built With

The website is built using:

* [Jekyll](https://jekyllrb.com/)
* [GitHub Pages](https://pages.github.com/)
* Markdown
* HTML, CSS and JavaScript
* GitHub Actions

Jekyll plugins provide features including:

* Search-engine metadata
* RSS feeds
* XML sitemaps
* Category archives

## Local Development

### Prerequisites

You will need:

* Ruby 3.1 or later
* Bundler
* Git

### Run the Site

Clone the repository:

```bash
git clone https://github.com/RAWRitsCloud/rawritscloud.github.io.git
cd rawritscloud.github.io
```

Install the dependencies:

```bash
bundle install
```

Start the local Jekyll server:

```bash
bundle exec jekyll serve
```

The website will normally be available at:

```text
http://localhost:4000
```

To include draft posts during local development:

```bash
bundle exec jekyll serve --drafts
```

## Content

Blog articles are written in Markdown and processed by Jekyll.

Site content and configuration are organised across directories including:

```text
_posts/             Published blog articles
_drafts/            Articles that have not yet been published
_pages/             Standalone website pages
_data/              Structured site data
_layouts/           Jekyll page layouts
_includes/          Reusable page components
assets/             Images, stylesheets and JavaScript
scripts/            Website automation scripts
.github/workflows/  GitHub Actions workflows
```

## Deployment

The production website is hosted using GitHub Pages.

Changes pushed to the `gh-pages` branch are built using Jekyll and deployed through GitHub Actions.

The deployment workflow:

1. Checks out the repository.
2. Configures Ruby and Bundler.
3. Builds the production Jekyll site.
4. Uploads the generated website.
5. Deploys it to GitHub Pages.

The website uses the custom domain:

```text
www.rawritscloud.com
```

## Certification Updates

The certifications page is generated from structured data stored in:

```text
_data/certifications.yml
```

A scheduled GitHub Actions workflow retrieves current certification information from public Microsoft Learn and Credly profiles.

When changes are detected, the workflow creates a draft pull request so the updates can be reviewed before publication.

## Contributing

For article corrections or website issues, you can also open a GitHub issue.

## Author

**James Murray-Ferris**

Cloud Solutions Consultant specialising in Azure, Terraform, automation and cloud cost optimisation.

* Website: [rawritscloud.com](https://www.rawritscloud.com)
* GitHub: [@RAWRitsCloud](https://github.com/RAWRitsCloud)
* LinkedIn: [James Murray-Ferris](https://www.linkedin.com/in/jrmurray86)
* Instagram: [@rawritscloud](https://www.instagram.com/rawritscloud)
* Bluesky: [@rawritscloud.com](https://bsky.app/profile/rawritscloud.com)

