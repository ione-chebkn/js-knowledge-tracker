# JavaScript Knowledge Tracker

CLI tool for tracking JavaScript learning progress by connecting theory with practice through Git commits.

## 🚀 Features

-   📚 Track JavaScript learning progress from [learn.javascript.ru](https://learn.javascript.ru)
-   🔗 Connect theory articles with real project commits
-   📊 Visualize progress with statistics
-   🔍 Validate projects and commits on GitHub
-   🔄 Automatic synchronization between projects

## 📦 Installation

```bash
npm install -g js-knowledge-tracker
```

## 🛠️ Usage

```bash
# Show available topics
jstrack suggest

# Mark article as applied
jstrack apply <articleId> --commit <hash> --project <project>

# Show applied articles
jstrack list --applied

# Show statistics
jstrack stats

# Show workflow guide
jstrack workflow

```

## 🎯 Example

```bash
# Get learning suggestions
jstrack suggest

# Apply article after implementing feature
jstrack apply closure --commit $(git log -1 --pretty=%H) --project my-app

# Check progress
jstrack stats
```

## 📁 Architecture

js-knowledge-tracker - CLI tool (this package)

js-knowledge-data - Central knowledge database repository

Your projects - Connect theory with practice

## 🔗 Links

[Knowledge Database](https://github.com/ione-chebkn/js-knowledge-data)
[Learn JavaScript](https://learn.javascript.ru/)
