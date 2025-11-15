#!/usr/bin/env node

import { program } from "commander"
import chalk from "chalk"
import {
    aiSuggestWithPlan,
    markAsApplied,
    markAsStudied,
    getKnowledgeBase,
    isCommitAlreadyLinked,
    findCommitUsage,
    getArticlesByProject,
    getProgressByLevel,
} from "./suggest.js"
import { getCurrentProjectName, validateProjectExists, validateCommitExists, askForConfirmation } from "./storage.js"

program.version("0.1.0").description("AI-powered JavaScript learning tracker")

/// В команде suggest
program
    .command("suggest <feature>")
    .description("Get AI suggestions for implementing a feature")
    .option("-p, --project-type <type>", "Project type (web, node, react, etc)", "web")
    .action(async (feature, options) => {
        if (!feature) {
            console.log(chalk.red("❌ Укажите фичу для которой нужны рекомендации"))
            console.log(chalk.gray("Пример: jstrack suggest 'валидация формы'"))
            return
        }

        console.log(chalk.blue.bold(`\n🎯 План реализации: "${feature}"\n`))

        const suggestion = aiSuggestWithPlan(feature, options.projectType)

        if (suggestion.hasDetailedPlan) {
            // Детальный пошаговый план
            console.log(chalk.cyan("📋 Пошаговый план:\n"))

            suggestion.plan.forEach((step, index) => {
                console.log(chalk.green.bold(step.step))
                console.log(chalk.white(`   ${step.description}\n`))

                if (step.articles && step.articles.length > 0) {
                    console.log(chalk.blue("   📚 Изучи:"))
                    step.articles.forEach((article) => {
                        console.log(chalk.gray(`     • ${article.title}`))
                        console.log(chalk.gray(`       ID: ${article.id}`))
                        console.log(chalk.gray(`       URL: ${article.url}`))

                        // Показываем релевантные секции
                        if (article.sections && article.sections.length > 0) {
                            const relevantSections = article.sections.filter((section) =>
                                step.keywords.some(
                                    (keyword) =>
                                        section.title.toLowerCase().includes(keyword) || section.id.includes(keyword)
                                )
                            )
                            if (relevantSections.length > 0) {
                                console.log(
                                    chalk.gray(`       Секции: ${relevantSections.map((s) => s.title).join(", ")}`)
                                )
                            }
                        }
                        console.log("")
                    })
                }

                if (index < suggestion.plan.length - 1) {
                    console.log(chalk.gray("   ════════════════════════════════════════"))
                }
                console.log("")
            })
        } else {
            // Общие рекомендации
            if (suggestion.articles.length === 0) {
                console.log(chalk.yellow("🤔 Не найдено подходящих статей для этой фичи"))
                console.log(chalk.gray("Попробуйте другие ключевые слова:"))
                console.log(chalk.gray("  • валидация формы"))
                console.log(chalk.gray("  • работа с API"))
                console.log(chalk.gray("  • анимация интерфейса"))
                console.log(chalk.gray("  • обработка событий"))
                return
            }

            console.log(chalk.cyan("📚 Рекомендуемые статьи:\n"))
            suggestion.articles.forEach((article, index) => {
                console.log(chalk.green(`${index + 1}. ${article.title}`))
                console.log(chalk.gray(`   ID: ${article.id}`))
                console.log(chalk.gray(`   URL: ${article.url}`))
                console.log("")
            })
        }
    })

// Команда для отметки статьи как примененной
program
    .command("apply <articleId>")
    .description("Mark article as applied in practice")
    .option("-p, --project <project>", "Project where applied (auto-detected if not provided)")
    .option("-c, --commit <commit>", "Commit hash (REQUIRED)")
    .option("-s, --section <sectionId>", "Specific section ID if applied only part of article")
    .option("--yes", "Skip confirmation prompt")
    .action(async (articleId, options) => {
        const project = options.project || getCurrentProjectName()
        const commit = options.commit
        const sectionId = options.section

        if (!commit) {
            console.log(chalk.red.bold("❌ Обязательно укажи хеш коммита через --commit"))
            console.log(chalk.gray("   Пример: jstrack apply events --commit abc123"))
            return
        }

        // Проверяем не привязан ли уже этот коммит к этой статье
        if (isCommitAlreadyLinked(articleId, project, commit, sectionId)) {
            console.log(
                chalk.red.bold(`❌ Коммит "${commit}" уже привязан к статье "${articleId}" в проекте "${project}"!`)
            )
            if (sectionId) {
                console.log(chalk.gray(`   Секция: ${sectionId}`))
            }
            console.log(chalk.gray("   Один коммит можно привязать к статье только один раз"))
            return
        }

        // Проверяем где еще используется этот коммит
        const commitUsages = findCommitUsage(commit, project)
        if (commitUsages.length > 0) {
            console.log(chalk.yellow("⚠️  Этот коммит уже используется в других статьях этого проекта:"))
            commitUsages.forEach((usage) => {
                const sectionInfo = usage.section ? ` (секция: ${usage.section})` : ""
                console.log(chalk.gray(`   • ${usage.article}${sectionInfo}`))
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
        const article = knowledgeBase[articleId]

        if (!article) {
            console.log(chalk.red.bold(`❌ Статья с ID "${articleId}" не найдена`))
            console.log(chalk.gray('Используй "jstrack list" чтобы увидеть все статьи'))
            return
        }

        // Находим информацию о секции если указана
        let sectionInfo = null
        if (sectionId && article.sections) {
            sectionInfo = article.sections.find((s) => s.id === sectionId)
            if (!sectionInfo) {
                console.log(chalk.red.bold(`❌ Секция с ID "${sectionId}" не найдена в статье "${articleId}"`))
                return
            }
        }

        // Подтверждение
        console.log(chalk.yellow("\n📝 Подтверждение:"))
        console.log(chalk.white(`   Статья: ${article.title}`))
        console.log(chalk.white(`   Уровень: ${article.level}`))
        console.log(chalk.white(`   URL: ${chalk.blue(article.url)}`))

        if (sectionInfo) {
            console.log(chalk.white(`   Секция: ${sectionInfo.title}`))
            console.log(chalk.white(`   URL секции: ${chalk.blue(sectionInfo.url)}`))
        }

        console.log(chalk.white(`   Проект: ${project}`))
        console.log(chalk.white(`   Коммит: ${commit}`))
        console.log(chalk.white(`   URL коммита: ${chalk.blue(`https://github.com/${project}/commit/${commit}`)}`))

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
        const result = markAsApplied(articleId, project, commit, sectionId)
        if (result.success) {
            console.log(chalk.green.bold(`\n✅ Статья "${article.title}" отмечена как примененная!`))
            if (sectionInfo) {
                console.log(chalk.gray(`   Секция: ${sectionInfo.title}`))
            }
            console.log(chalk.gray(`   Проект: ${project}`))
            console.log(chalk.gray(`   Коммит: ${commit}`))
            console.log(chalk.gray(`   Прогресс статьи: 100%`))
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
            console.log(chalk.gray(`   Прогресс: 100%`))
        } else {
            console.log(chalk.red.bold(`❌ Статья с ID "${articleId}" не найдена`))
        }
    })

program
    .command("project <projectName>")
    .description("Show all articles applied in specific project")
    .action((projectName) => {
        console.log(chalk.blue.bold(`\n📁 Articles applied in "${projectName}":\n`))

        const projectArticles = getArticlesByProject(projectName)

        if (projectArticles.length === 0) {
            console.log(chalk.yellow(`  No articles applied in project "${projectName}"`))
            console.log(chalk.gray(`  Use "jstrack apply --project ${projectName}" to add articles`))
            return
        }

        // Группируем по уровням для лучшего отображения
        const articlesByLevel = {}
        projectArticles.forEach((article) => {
            const level = article.level || "unknown"
            if (!articlesByLevel[level]) {
                articlesByLevel[level] = []
            }
            articlesByLevel[level].push(article)
        })

        Object.entries(articlesByLevel).forEach(([level, articles]) => {
            console.log(chalk.cyan(`📚 ${level.toUpperCase()}:`))
            articles.forEach((article) => {
                console.log(`  ${chalk.green("•")} ${article.title}`)
                console.log(`    ID: ${chalk.yellow(article.id)}`)
                console.log(`    URL: ${chalk.gray(article.url)}`)

                // Показываем применения
                article.applications.forEach((app, index) => {
                    const sectionInfo = app.section ? ` (${app.section})` : ""
                    console.log(`    ${index + 1}. Commit: ${chalk.gray(app.commit)}${sectionInfo}`)
                })

                console.log(`    Total applications: ${chalk.magenta(article.applicationCount)}`)
                console.log("")
            })
        })

        const totalArticles = projectArticles.length
        const totalApplications = projectArticles.reduce((sum, article) => sum + article.applicationCount, 0)

        console.log(chalk.magenta(`📊 Summary: ${totalArticles} articles, ${totalApplications} total applications`))
    })

// Команда для просмотра всех статей
program
    .command("list")
    .description("List articles with filters")
    .option("-a, --applied", "Show only applied articles (progress 100%)")
    .option("-s, --studied", "Show only studied articles")
    .option("-u, --unused", "Show only unused articles (progress < 100%)")
    .option("-q, --query <keyword>", "Search articles by keyword")
    .option("-n, --number <count>", "Number of articles to show (default: 3)", "3")
    .action((options) => {
        console.log(chalk.blue.bold("\n📖 JavaScript Articles\n"))
        const knowledgeBase = getKnowledgeBase()

        let articlesToShow = Object.values(knowledgeBase)

        // Применяем фильтры
        if (options.applied) {
            articlesToShow = articlesToShow.filter((a) => a.progress === 100)
            console.log(chalk.green("🟢 Applied Articles (100%):\n"))
        } else if (options.studied) {
            articlesToShow = articlesToShow.filter((a) => a.progress === 100)
            console.log(chalk.blue("🔵 Studied Articles (100%):\n"))
        } else if (options.unused) {
            articlesToShow = articlesToShow.filter((a) => (a.progress || 0) < 100 && a.level !== "syntax")
            console.log(chalk.yellow("🟡 Unused Articles (<100%, без syntax):\n"))
        } else if (options.level) {
            articlesToShow = articlesToShow.filter((a) => a.level === options.level)
            console.log(chalk.cyan(`📚 ${options.level.toUpperCase()} Articles:\n`))
        } else if (options.query) {
            const query = options.query.toLowerCase()
            articlesToShow = articlesToShow.filter(
                (a) =>
                    a.title.toLowerCase().includes(query) ||
                    a.id.toLowerCase().includes(query) ||
                    a.level.toLowerCase().includes(query) ||
                    (a.sections &&
                        a.sections.some(
                            (s) => s.title.toLowerCase().includes(query) || s.id.toLowerCase().includes(query)
                        ))
            )
            console.log(chalk.cyan(`🔍 Search results for "${options.query}":\n`))
        } else {
            // По умолчанию показываем только concept (без syntax)
            articlesToShow = articlesToShow.filter((a) => a.level !== "syntax")
            console.log(chalk.cyan("📚 All Articles (без syntax):\n"))
        }

        if (articlesToShow.length === 0) {
            console.log(chalk.yellow("  No articles found"))
            return
        }

        // Применяем ограничение по количеству (по умолчанию 5)
        const articleCount = parseInt(options.number) || 5
        const limitedArticles = articlesToShow.slice(0, articleCount)

        limitedArticles.forEach((article) => {
            const progress = article.progress || 0
            const statusIcon = progress === 100 ? "🟢" : progress > 0 ? "🟡" : "⚪"
            const statusText = progress === 100 ? "COMPLETED" : `IN PROGRESS (${progress}%)`

            console.log(`  ${statusIcon} ${article.title}`)
            console.log(`    ID: ${article.id} | Progress: ${statusText}`)
            console.log(`    URL: ${article.url}`)

            // Показываем секции если есть
            if (article.sections && article.sections.length > 0) {
                console.log(`    Sections: ${article.sections.length}`)
            }

            // Показываем применения
            if (progress === 100) {
                const applications = []
                if (article.applications) {
                    applications.push(...article.applications)
                }
                if (article.sections) {
                    article.sections.forEach((section) => {
                        if (section.applications) {
                            applications.push(...section.applications)
                        }
                    })
                }

                if (applications.length > 0) {
                    const projects = [...new Set(applications.map((app) => app.project))]
                    console.log(`    📁 Projects: ${projects.join(", ")}`)
                    console.log(`    📎 Total applications: ${applications.length}`)
                }
            }
            console.log("")
        })

        // Показываем информацию об ограничении
        if (articlesToShow.length > articleCount) {
            console.log(chalk.magenta(`📊 Показано ${limitedArticles.length} из ${articlesToShow.length} статей`))
            console.log(
                chalk.gray(`Используйте 'jstrack list [фильтры] -n ${articlesToShow.length}' чтобы увидеть все`)
            )
        } else {
            console.log(chalk.magenta(`📊 Всего статей: ${articlesToShow.length}`))
        }
    })

program
    .command("show <articleId>")
    .description("Show detailed information about article")
    .action((articleId) => {
        const knowledgeBase = getKnowledgeBase()
        const article = knowledgeBase[articleId]

        if (!article) {
            console.log(chalk.red(`❌ Статья с ID "${articleId}" не найдена`))
            console.log(chalk.gray('Используй "jstrack list" чтобы увидеть все статьи'))
            return
        }

        console.log(chalk.blue.bold(`\n📖 ${article.title}\n`))
        console.log(chalk.gray(`ID: ${article.id}`))
        console.log(chalk.gray(`Level: ${article.level}`))
        console.log(chalk.gray(`URL: ${article.url}`))

        // Прогресс и статус
        const progress = article.progress || 0
        const statusIcon = progress === 100 ? "🟢" : progress > 0 ? "🟡" : "⚪"
        console.log(`Progress: ${statusIcon} ${progress}%`)

        // Секции
        if (article.sections && article.sections.length > 0) {
            console.log(chalk.cyan("\n📑 Sections:"))
            article.sections.forEach((section) => {
                const sectionApps = section.applications ? section.applications.length : 0
                const sectionStatus = sectionApps > 0 ? chalk.green(`✓ ${sectionApps}`) : chalk.gray("○")
                console.log(`  ${sectionStatus} ${section.title}`)
                console.log(`    ID: ${section.id}`)
                console.log(`    URL: ${section.url}`)

                if (section.applications && section.applications.length > 0) {
                    section.applications.forEach((app) => {
                        console.log(`    📎 ${app.project}: ${app.commit}`)
                    })
                }
            })
        }

        // Применения
        const allApplications = []
        if (article.applications) {
            allApplications.push(...article.applications.map((app) => ({ ...app, section: null })))
        }
        if (article.sections) {
            article.sections.forEach((section) => {
                if (section.applications) {
                    allApplications.push(
                        ...section.applications.map((app) => ({
                            ...app,
                            section: section.title,
                        }))
                    )
                }
            })
        }

        if (allApplications.length > 0) {
            console.log(chalk.green("\n📁 All Applications:"))

            // Группируем по проектам
            const byProject = {}
            allApplications.forEach((app) => {
                if (!byProject[app.project]) {
                    byProject[app.project] = []
                }
                byProject[app.project].push(app)
            })

            Object.entries(byProject).forEach(([project, apps]) => {
                console.log(`  • ${chalk.bold(project)}:`)
                apps.forEach((app) => {
                    const sectionInfo = app.section ? ` (${app.section})` : ""
                    console.log(`    📎 ${app.commit}${sectionInfo}`)
                })
            })

            console.log(
                chalk.magenta(
                    `\n📊 Total: ${allApplications.length} applications in ${Object.keys(byProject).length} projects`
                )
            )
        } else if (progress === 100) {
            console.log(chalk.yellow("\nℹ️  Studied but not applied in practice"))
        } else {
            console.log(chalk.gray("\nℹ️  Not yet studied or applied"))
        }

        console.log("")
    })

// Команда stats
program
    .command("stats")
    .description("Show learning statistics")
    .action(() => {
        const knowledgeBase = getKnowledgeBase()
        const allArticles = Object.values(knowledgeBase)

        const completed = allArticles.filter((a) => (a.progress || 0) === 100).length
        const inProgress = allArticles.filter((a) => (a.progress || 0) > 0 && (a.progress || 0) < 100).length
        const notStarted = allArticles.filter((a) => (a.progress || 0) === 0).length
        const total = allArticles.length
        const overallProgress = Math.round((completed / total) * 100)

        console.log(chalk.blue.bold("\n📊 Learning Statistics\n"))
        console.log(`🟢 Завершено: ${completed}/${total} (${overallProgress}%)`)
        console.log(`🟡 В процессе: ${inProgress}/${total}`)
        console.log(`⚪ Не начато: ${notStarted}/${total}\n`)

        // Статистика по уровням
        const levelProgress = getProgressByLevel()
        console.log(chalk.cyan("📈 Progress by Level:"))
        Object.entries(levelProgress).forEach(([level, stats]) => {
            const progressBar =
                "█".repeat(Math.round(stats.progress / 10)) + "░".repeat(10 - Math.round(stats.progress / 10))
            console.log(
                `  ${level.toUpperCase()}: ${progressBar} ${stats.progress}% (${stats.completed}/${stats.total})`
            )
        })

        console.log("")

        if (completed > 0) {
            console.log(chalk.green("🎉 Отличный прогресс! Продолжай в том же духе! 🚀"))
        }
    })

function showWorkflow() {
    console.log(chalk.blue.bold("\n🚀 JavaScript Knowledge Tracker - Workflow\n"))

    console.log(chalk.green("🎯 Умные подсказки:"))
    console.log("  jstrack suggest 'валидация формы'    - Пошаговый план с статьями")
    console.log("  jstrack suggest 'работа с API'       - Детальные рекомендации")
    console.log("  jstrack suggest 'анимация интерфейса' - План реализации\n")

    console.log(chalk.green("📚 Управление знаниями:"))
    console.log("  jstrack list --unused               - 5 неиспользованных тем")
    console.log("  jstrack list --applied              - 5 примененных статей")
    console.log("  jstrack apply <id> --commit <hash>  - Отметить применение")
    console.log("  jstrack show <id>                   - Детальная информация")
    console.log("  jstrack stats                       - Статистика прогресса\n")

    console.log(chalk.cyan("💡 Пример работы:"))
    console.log(chalk.gray("  $ jstrack suggest 'валидация формы'"))
    console.log(chalk.gray("  → Получите пошаговый план:"))
    console.log(chalk.gray("    1. Обработка событий формы"))
    console.log(chalk.gray("       • Статья: События"))
    console.log(chalk.gray("    2. Валидация полей"))
    console.log(chalk.gray("       • Статья: Регулярные выражения"))
    console.log(chalk.gray("    3. Показать ошибки"))
    console.log(chalk.gray("       • Статья: Работа с DOM"))
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
