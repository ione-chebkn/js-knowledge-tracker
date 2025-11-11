#!/usr/bin/env node

import { program } from "commander"
import chalk from "chalk"
import {
    getUnusedArticles,
    suggestByCategory,
    aiSuggest,
    markAsApplied,
    markAsStudied,
    getAppliedArticles,
    getKnowledgeBase,
    isCommitAlreadyLinked,
    findCommitUsage,
} from "./suggest.js"
import { getCurrentProjectName, validateProjectExists, validateCommitExists, askForConfirmation } from "./storage.js"

program.version("0.1.0").description("AI-powered JavaScript learning tracker")

// Основная команда suggest
program
    .command("suggest")
    .description("Show available topics for learning")
    .action(() => {
        console.log(chalk.blue.bold("\n🎯 JavaScript Learning Suggestions\n"))

        const suggestions = suggestByCategory()

        Object.entries(suggestions).forEach(([category, articles]) => {
            console.log(chalk.cyan(`\n📚 ${category}:`))
            articles.forEach((article) => {
                console.log(`  ${chalk.green("•")} ${article.title}`)
                console.log(`    ID: ${chalk.yellow(article.id)}`)
                console.log(`    URL: ${chalk.gray(`https://learn.javascript.ru${article.url}`)}`)
            })
        })

        const totalUnused = getUnusedArticles().length
        console.log(chalk.magenta(`\n📊 Всего тем для изучения: ${totalUnused}\n`))
    })

// Команда для отметки статьи как примененной
program
    .command("apply <articleId>")
    .description("Mark article as applied in practice")
    .option("-p, --project <project>", "Project where applied (auto-detected if not provided)")
    .option("-c, --commit <commit>", "Commit hash (REQUIRED)")
    .option("--yes", "Skip confirmation prompt")
    .action(async (articleId, options) => {
        const project = options.project || getCurrentProjectName()
        const commit = options.commit

        if (!commit) {
            console.log(chalk.red.bold("❌ Обязательно укажи хеш коммита через --commit"))
            console.log(chalk.gray("   Пример: jstrack apply events --commit abc123"))
            return
        }

        // Проверяем не привязан ли уже этот коммит к этой статье
        if (isCommitAlreadyLinked(articleId, project, commit)) {
            console.log(
                chalk.red.bold(`❌ Коммит "${commit}" уже привязан к статье "${articleId}" в проекте "${project}"!`)
            )
            console.log(chalk.gray("   Один коммит можно привязать к статье только один раз"))
            return
        }

        // Проверяем где еще используется этот коммит
        const commitUsages = findCommitUsage(commit, project)
        if (commitUsages.length > 0) {
            console.log(chalk.yellow("⚠️  Этот коммит уже используется в других статьях этого проекта:"))
            commitUsages.forEach((usage) => {
                console.log(chalk.gray(`   • ${usage.article} (${usage.project})`))
            })
            console.log("")
        }

        let projectValidation = { exists: true, skipCheck: true }
        let commitValidation = { exists: true, skipCheck: true }

        console.log(chalk.blue("🔍 Проверяем проект на GitHub..."))
        projectValidation = await validateProjectExists(project)

        if (!projectValidation.exists && !projectValidation.skipCheck) {
            console.log(chalk.red.bold(`❌ Проект "${project}" не найден на GitHub!`))
            console.log(chalk.gray("   Проверь название репозитория"))
            console.log(chalk.gray("   Или используй --skip-validation чтобы пропустить проверку"))
            return
        }

        if (projectValidation.exists && !projectValidation.skipCheck) {
            console.log(chalk.green("✅ Проект найден на GitHub"))

            // Проверяем коммит
            console.log(chalk.blue("🔍 Проверяем коммит на GitHub..."))
            commitValidation = await validateCommitExists(project, commit)

            if (!commitValidation.exists && !commitValidation.skipCheck) {
                console.log(chalk.red.bold(`❌ Коммит "${commit}" не найден в проекте "${project}"!`))
                console.log(chalk.gray("   Проверь хеш коммита"))
                console.log(chalk.gray("   Или используй --skip-validation чтобы пропустить проверку"))
                return
            }

            if (commitValidation.exists && !commitValidation.skipCheck) {
                console.log(chalk.green("✅ Коммит найден"))
                console.log(chalk.gray(`   Сообщение: ${commitValidation.message}`))
                console.log(chalk.gray(`   Автор: ${commitValidation.author}`))
                console.log(chalk.gray(`   Дата: ${new Date(commitValidation.date).toLocaleString()}`))
            }
        }

        // Находим статью для показа информации
        const knowledgeBase = getKnowledgeBase()
        let articleInfo = null
        Object.values(knowledgeBase).forEach((category) => {
            category.articles.forEach((article) => {
                if (article.id === articleId) {
                    articleInfo = article
                }
            })
        })

        if (!articleInfo) {
            console.log(chalk.red.bold(`❌ Статья с ID "${articleId}" не найдена`))
            return
        }

        // Подтверждение
        console.log(chalk.yellow("\n📝 Подтверждение:"))
        console.log(chalk.white(`   Статья: ${articleInfo.title}`))
        console.log(chalk.white(`   Проект: ${project}`))
        console.log(chalk.white(`   Коммит: ${commit}`))

        if (commitValidation.message) {
            console.log(chalk.white(`   Сообщение коммита: ${commitValidation.message}`))
        }

        let confirmed = options.yes
        if (!confirmed) {
            confirmed = await askForConfirmation(chalk.yellow("\n✅ Добавить связь? (y/N) "))
        }

        if (!confirmed) {
            console.log(chalk.gray("❌ Отменено"))
            return
        }

        // Сохраняем
        const result = markAsApplied(articleId, project, commit)
        if (result.success) {
            console.log(chalk.green.bold(`\n✅ Статья "${articleInfo.title}" отмечена как примененная!`))
            console.log(chalk.gray(`   Проект: ${project}`))
            console.log(chalk.gray(`   Коммит: ${commit}`))
        } else {
            console.log(chalk.red.bold(`❌ Ошибка при сохранении`))
        }
    })

// Команда для отметки статьи как изученной
program
    .command("study <articleId>")
    .description("Mark article as studied")
    .action((articleId) => {
        const result = markAsStudied(articleId)
        if (result.success) {
            console.log(chalk.blue.bold(`📚 Статья "${result.article.title}" отмечена как изученная!`))
        } else {
            console.log(chalk.red.bold(`❌ Статья с ID "${articleId}" не найдена`))
        }
    })

// Команда для просмотра всех статей
program
    .command("list")
    .description("List articles with filters")
    .option("-a, --applied", "Show only applied articles")
    .option("-s, --studied", "Show only studied articles")
    .option("-u, --unused", "Show only unused articles")
    .action((options) => {
        console.log(chalk.blue.bold("\n📖 JavaScript Articles\n"))
        const knowledgeBase = getKnowledgeBase()

        let articlesToShow = Object.values(knowledgeBase).flatMap((category) =>
            category.articles.map((article) => ({
                ...article,
                category: category.title,
            }))
        )

        if (options.applied) {
            articlesToShow = articlesToShow.filter((a) => a.applied)
            console.log(chalk.green("🟢 Applied Articles:\n"))
        } else if (options.studied) {
            articlesToShow = articlesToShow.filter((a) => a.status === "studied")
            console.log(chalk.blue("🔵 Studied Articles:\n"))
        } else if (options.unused) {
            articlesToShow = articlesToShow.filter((a) => !a.applied && a.status !== "studied")
            console.log(chalk.yellow("🟡 Unused Articles:\n"))
        } else {
            console.log(chalk.cyan("📚 All Articles:\n"))
        }

        if (articlesToShow.length === 0) {
            console.log(chalk.yellow("  No articles found"))
            return
        }

        articlesToShow.forEach((article) => {
            const statusIcon = article.applied ? "🟢" : article.status === "studied" ? "🔵" : "🟡"
            const statusText = article.applied ? "APPLIED" : article.status === "studied" ? "STUDIED" : "NOT USED"

            console.log(`  ${statusIcon} [${article.category}] ${article.title}`)
            console.log(`    ID: ${article.id} | Status: ${statusText}`)
            console.log(`    URL: https://learn.javascript.ru${article.url}`)

            // ПОКАЗЫВАЕМ ПРОЕКТЫ ДЛЯ ПРИМЕНЕННЫХ СТАТЕЙ
            if (article.applied && article.applications) {
                const projects = Object.keys(article.applications)
                console.log(`    📁 Projects: ${projects.join(", ")}`)
            }
            console.log("")
        })
    })

program
    .command("show <articleId>")
    .description("Show detailed information about article")
    .action((articleId) => {
        const knowledgeBase = getKnowledgeBase()
        let found = false

        Object.values(knowledgeBase).forEach((category) => {
            category.articles.forEach((article) => {
                if (article.id === articleId) {
                    found = true
                    console.log(chalk.blue.bold(`\n📖 ${article.title}\n`))
                    console.log(chalk.gray(`ID: ${article.id}`))
                    console.log(chalk.gray(`Category: ${category.title}`))
                    console.log(chalk.gray(`URL: https://learn.javascript.ru${article.url}`))

                    // Статус
                    const statusIcon = article.applied ? "🟢" : article.status === "studied" ? "🔵" : "🟡"
                    const statusText = article.applied
                        ? "APPLIED"
                        : article.status === "studied"
                        ? "STUDIED"
                        : "NOT USED"
                    console.log(`Status: ${statusIcon} ${statusText}`)

                    // Детали применений
                    if (article.applied && article.applications) {
                        console.log(chalk.green("\n📁 Applications:"))
                        Object.entries(article.applications).forEach(([project, commits]) => {
                            console.log(`  • ${chalk.bold(project)}:`)
                            commits.forEach((commit) => {
                                console.log(`    📎 ${commit}`)
                            })
                        })

                        const totalApplications = Object.values(article.applications).reduce(
                            (sum, commits) => sum + commits.length,
                            0
                        )
                        console.log(
                            chalk.magenta(
                                `\n📊 Total: ${totalApplications} applications in ${
                                    Object.keys(article.applications).length
                                } projects`
                            )
                        )
                    } else if (article.applied) {
                        console.log(chalk.yellow("\nℹ️  Applied but no application details"))
                    }

                    // Рекомендации для этой статьи
                    // console.log(chalk.cyan("\n💡 Related topics:"))
                    // const related = aiSuggest(article.title)
                    // if (related.length > 0) {
                    //     related.forEach((relatedArticle) => {
                    //         if (relatedArticle.id !== articleId) {
                    //             console.log(`  • ${relatedArticle.title}`)
                    //         }
                    //     })
                    // } else {
                    //     console.log(chalk.gray("  No specific recommendations"))
                    // }

                    console.log("")
                }
            })
        })

        if (!found) {
            console.log(chalk.red(`❌ Статья с ID "${articleId}" не найдена`))
            console.log(chalk.gray('Используй "jstrack list" чтобы увидеть все статьи'))
        }
    })

// Простая команда stats
program
    .command("stats")
    .description("Show learning statistics")
    .action(() => {
        const knowledgeBase = getKnowledgeBase()
        const allArticles = Object.values(knowledgeBase).flatMap((category) => category.articles)

        const applied = allArticles.filter((a) => a.applied).length
        const studied = allArticles.filter((a) => a.status === "studied").length
        const unused = allArticles.filter((a) => !a.applied && a.status !== "studied").length
        const total = allArticles.length
        const progress = Math.round((applied / total) * 100)

        console.log(chalk.blue.bold("\n📊 Learning Statistics\n"))
        console.log(`🟢 Применено: ${applied}/${total} (${progress}%)`)
        console.log(`🔵 Изучено: ${studied}/${total}`)
        console.log(`🟡 Осталось: ${unused} тем\n`)

        if (applied > 0) {
            console.log(chalk.green("🎉 Отличный прогресс! Продолжай в том же духе! 🚀"))
        }
    })

function showWorkflow() {
    console.log(chalk.blue.bold("\n🚀 JavaScript Knowledge Tracker - Workflow\n"))

    console.log(chalk.green("📚 Основные команды:"))
    console.log("  jstrack suggest                    - Показать доступные темы")
    console.log("  jstrack apply <id> --commit <hash> - Отметить применение темы")
    console.log("  jstrack list                      - Все статьи")
    console.log("  jstrack list --applied            - Примененные статьи")
    console.log("  jstrack list --unused             - Неиспользованные статьи")
    console.log("  jstrack show <id>                 - Детальная информация о статье")
    console.log("  jstrack stats                     - Статистика прогресса")
    console.log("  jstrack workflow                  - Показать этот гайд\n")

    console.log(chalk.cyan("🎯 Пример workflow:"))
    console.log(chalk.white("  1. ") + chalk.yellow("Найти статью:"))
    console.log("     " + chalk.gray("jstrack list --unused"))
    console.log("     " + chalk.gray("jstrack show closure\n"))

    console.log(chalk.white("  2. ") + chalk.yellow("Реализовать и отметить:"))
    console.log("     " + chalk.gray("jstrack apply closure --commit $(git log -1 --pretty=%H)\n"))

    console.log(chalk.white("  3. ") + chalk.yellow("Проверить результат:"))
    console.log("     " + chalk.gray("jstrack show closure"))
    console.log("     " + chalk.gray("jstrack stats\n"))

    console.log(chalk.magenta("⚡ Авто-определение:"))
    console.log("  " + chalk.gray("• Проект: определяется из git remote или package.json"))
    console.log("  " + chalk.gray("• Коммит: ОБЯЗАТЕЛЬНО указывать через --commit\n"))
}

// Добавим команду workflow
program
    .command("workflow")
    .description("Show usage workflow and examples")
    .action(() => {
        showWorkflow()
    })

// Также добавим help команду по умолчанию
program
    .command("help")
    .description("Show help information")
    .action(() => {
        program.help()
    })

program.parse()
