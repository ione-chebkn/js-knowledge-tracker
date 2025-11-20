#!/usr/bin/env node

import { program } from "commander"
import chalk from "chalk"
import {
    aiSuggestWithPlan,
    markAsApplied,
    getKnowledgeBase,
    findCommitUsage,
    getArticlesByProject,
    calculateArticleProgress,
    createProgressBar,
    updateArticleProgress,
    getAllArticles,
    findArticleInCategories,
} from "./suggest.js"
import {
    getCurrentProjectName,
    validateProjectExists,
    validateCommitExists,
    askForConfirmation,
    saveKnowledgeBase,
    askQuestion,
} from "./storage.js"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"))

program.version(packageJson.version).description("AI-powered JavaScript learning tracker")

// Вспомогательная функция для отображения ссылки
function formatUrl(url) {
    return chalk.blue.underline(url)
}

// Команда search - умный поиск по статьям и подтемам
// УПРОЩЕННАЯ команда search
program
    .command("search <query>")
    .description("Search articles")
    .option("-n, --number <count>", "Number of results", "5")
    .action((query, options) => {
        console.log(chalk.blue(`🔍 "${query}"\n`))
        const knowledgeBase = getKnowledgeBase()
        const allArticles = getAllArticles(knowledgeBase)

        const results = allArticles
            .filter((article) => {
                const queryLower = query.toLowerCase()

                // 🔍 Проверяем ВСЕ поля статьи
                if (
                    article.title.toLowerCase().includes(queryLower) ||
                    article.id.includes(queryLower) ||
                    article.url.toLowerCase().includes(queryLower) ||
                    (article.description && article.description.toLowerCase().includes(queryLower))
                ) {
                    return true
                }

                // 🔍 Проверяем ВСЕ поля подтем
                if (article.sections) {
                    return article.sections.some(
                        (section) =>
                            section.title.toLowerCase().includes(queryLower) ||
                            section.id.includes(queryLower) ||
                            section.url.toLowerCase().includes(queryLower)
                    )
                }

                return false
            })
            .map((article) => {
                // Считаем общее количество применений
                const applicationsCount =
                    (article.applications?.length || 0) +
                    (article.sections?.reduce((sum, s) => sum + (s.applications?.length || 0), 0) || 0)

                return {
                    article,
                    applicationsCount,
                    relevance: calculateRelevance(article, query),
                }
            })
            // СОРТИРОВКА: сначала по применениям, потом по релевантности
            .sort((a, b) => {
                // Примененные статьи выше
                if (a.applicationsCount > 0 && b.applicationsCount === 0) return -1
                if (a.applicationsCount === 0 && b.applicationsCount > 0) return 1
                // Если обе применены или не применены - сортируем по релевантности
                return b.relevance - a.relevance
            })
            .slice(0, parseInt(options.number))

        results.forEach((item, index) => {
            const { article, applicationsCount } = item

            console.log(chalk.green(`${index + 1}. ${applicationsCount ? "🟢" : "⚪"} ${article.title}`))
            console.log(chalk.gray(`   ${article.id} | apps:${applicationsCount}`))

            // Релевантные подтемы
            if (article.sections) {
                const relevantSections = article.sections
                    .filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
                    .slice(0, 2)
                if (relevantSections.length > 0) {
                    console.log(chalk.cyan(`   ${relevantSections.map((s) => s.title).join(" • ")}`))
                }
            }

            console.log("")
        })

        if (results.length === 0) {
            console.log(chalk.gray("No results"))
        }
    })

function calculateRelevance(article, query) {
    let score = 0
    const queryLower = query.toLowerCase()

    // 🔍 ПОИСК ПО ВСЕМ ПОЛЯМ СТАТЬИ
    const articleFields = [article.title, article.id, article.url, article.description || "", article.level || ""]

    articleFields.forEach((field) => {
        if (field.toLowerCase().includes(queryLower)) {
            score += field === article.title ? 3 : 2 // Больше веса заголовку
        }
    })

    // 🔍 ПОИСК ПО ВСЕМ ПОЛЯМ ПОДТЕМ
    if (article.sections) {
        article.sections.forEach((section) => {
            const sectionFields = [section.title, section.id, section.url]

            sectionFields.forEach((field) => {
                if (field.toLowerCase().includes(queryLower)) {
                    score += field === section.title ? 2 : 1
                }
            })
        })
    }

    return score
}

// Обновленная функция поиска для интерактивного apply
program
    .command("apply [articleId]")
    .description("Mark article section as applied")
    .option("-p, --project <project>", "Project where applied")
    .option("-c, --commit <commit>", "Commit hash")
    .option("-s, --section <sectionId>", "Specific section ID (REQUIRED for direct mode)")
    .option("--yes", "Skip confirmation prompt")
    .action(async (articleId, options) => {
        // РЕЖИМ 1: Интерактивный (если не указан articleId)
        if (!articleId) {
            console.log(chalk.blue.bold("\n🎯 Применение подтемы\n"))

            try {
                // 1. Спросить что применяли
                const query = await askQuestion(
                    "Какую подтему вы реализовали? (например: 'обработка keydown', 'валидация формы'): "
                )

                if (!query || query.trim() === "") {
                    console.log(chalk.red("❌ Запрос не может быть пустым"))
                    return
                }

                // 2. Найти подходящие ПОДТЕМЫ (только подтемы!)
                const knowledgeBase = getKnowledgeBase()
                const allArticles = getAllArticles(knowledgeBase)
                const suggestions = []

                console.log(chalk.blue(`🔍 Ищем "${query}" в подтемах...`))

                // Ищем ТОЛЬКО в подтемах
                allArticles.forEach((article) => {
                    if (article.sections) {
                        article.sections.forEach((section) => {
                            let relevance = 0
                            const sectionTitle = section.title.toLowerCase()
                            const sectionId = section.id.toLowerCase()
                            const articleTitle = article.title.toLowerCase()

                            // Поиск в подтеме
                            if (sectionTitle.includes(query.toLowerCase())) relevance += 3
                            if (sectionId.includes(query.toLowerCase())) relevance += 2

                            // Учитываем название статьи для контекста (меньший вес)
                            if (articleTitle.includes(query.toLowerCase())) relevance += 1

                            if (relevance > 0) {
                                suggestions.push({
                                    article,
                                    section,
                                    relevance,
                                })
                            }
                        })
                    }
                })

                // Сортируем по релевантности
                suggestions.sort((a, b) => b.relevance - a.relevance)
                const topSuggestions = suggestions.slice(0, 8)

                if (topSuggestions.length === 0) {
                    console.log(chalk.yellow("🤔 Не найдено подходящих подтем"))
                    console.log(chalk.gray("Попробуйте:"))
                    console.log(chalk.gray("  • Использовать другие ключевые слова"))
                    console.log(chalk.gray("  • Посмотреть все статьи: jstrack list"))
                    console.log(chalk.gray("  • Найти точнее: jstrack search <запрос>"))
                    return
                }

                console.log(chalk.cyan("\n📚 Найдены подтемы:"))

                let optionNumber = 1
                const optionsMap = new Map()

                topSuggestions.forEach((suggestion) => {
                    const { article, section } = suggestion

                    // ПОДСВЕТКА: проверяем применена ли подтема
                    const isApplied = section.applications && section.applications.length > 0
                    const statusIcon = isApplied ? "🟢" : "⚪"
                    const appliedText = isApplied ? chalk.gray(` (применена ${section.applications.length} раз)`) : ""

                    console.log(chalk.blue(`${optionNumber}. ${statusIcon} ${section.title}${appliedText}`))
                    console.log(chalk.gray(`   Статья: ${article.title}`))
                    console.log(chalk.gray(`   ID: ${article.id} --section ${section.id}`))
                    console.log(`   📖 ${formatUrl(section.url)}`)

                    optionsMap.set(optionNumber.toString(), {
                        articleId: article.id,
                        sectionId: section.id,
                        isApplied,
                    })
                    optionNumber++
                    console.log("")
                })

                const choice = await askQuestion(`Выберите подтему (1-${optionNumber - 1}) или введите ID вручную: `)

                if (optionsMap.has(choice)) {
                    const selected = optionsMap.get(choice)
                    articleId = selected.articleId
                    options.section = selected.sectionId

                    // ПРЕДУПРЕЖДЕНИЕ: если подтема уже применена
                    if (selected.isApplied) {
                        console.log(chalk.yellow("⚠️  Эта подтема уже имеет применения!"))
                        const proceed = await askForConfirmation("Всё равно добавить новое применение? (y/N) ")
                        if (!proceed) {
                            console.log(chalk.gray("❌ Отменено"))
                            return
                        }
                    }
                } else if (choice.includes("--section")) {
                    // Ручной ввод с секцией
                    const parts = choice.split("--section")
                    articleId = parts[0].trim()
                    options.section = parts[1] ? parts[1].trim() : null
                } else {
                    // Пользователь ввел только articleId - нужно выбрать подтему
                    console.log(chalk.yellow("\n📝 Нужно выбрать подтему для статьи:"))

                    const article = findArticleInCategories(knowledgeBase, choice)?.article
                    if (article && article.sections) {
                        console.log(chalk.cyan(`   Статья: ${article.title}`))
                        article.sections.forEach((section, index) => {
                            const isApplied = section.applications && section.applications.length > 0
                            const statusIcon = isApplied ? "🟢" : "⚪"
                            const appliedText = isApplied
                                ? chalk.gray(` (применена ${section.applications.length} раз)`)
                                : ""

                            console.log(chalk.blue(`   ${index + 1}. ${statusIcon} ${section.title}${appliedText}`))
                            console.log(chalk.gray(`      ID: ${section.id}`))
                        })

                        const sectionChoice = await askQuestion(`\nВыберите подтему (1-${article.sections.length}): `)
                        if (/^\d+$/.test(sectionChoice) && parseInt(sectionChoice) <= article.sections.length) {
                            articleId = choice
                            options.section = article.sections[parseInt(sectionChoice) - 1].id

                            // ПРЕДУПРЕЖДЕНИЕ: если подтема уже применена
                            const selectedSection = article.sections[parseInt(sectionChoice) - 1]
                            if (selectedSection.applications && selectedSection.applications.length > 0) {
                                console.log(chalk.yellow("⚠️  Эта подтема уже имеет применения!"))
                                const proceed = await askForConfirmation("Всё равно добавить новое применение? (y/N) ")
                                if (!proceed) {
                                    console.log(chalk.gray("❌ Отменено"))
                                    return
                                }
                            }
                        } else {
                            console.log(chalk.red("❌ Нужно выбрать подтему из списка"))
                            return
                        }
                    } else {
                        console.log(chalk.red("❌ Нужно указать подтему через --section"))
                        console.log(chalk.gray("Пример: keyboard-events --section sobytiya-keydown-i-keyup"))
                        return
                    }
                }

                // Запросить коммит если не указан
                if (!options.commit) {
                    options.commit = await askQuestion("Хеш коммита (обязательно): ")
                    if (!options.commit) {
                        console.log(chalk.red("❌ Хеш коммита обязателен!"))
                        return
                    }
                }

                // Запросить проект если не указан
                if (!options.project) {
                    options.project =
                        (await askQuestion(`Название проекта [${getCurrentProjectName()}]: `)) ||
                        getCurrentProjectName()
                }
            } catch (error) {
                console.log(chalk.red("❌ Ошибка:"), error.message)
                return
            }
        }

        // РЕЖИМ 2: Прямой (если указан articleId)
        else {
            // ПРОВЕРКА: в прямом режиме section ОБЯЗАТЕЛЕН
            if (!options.section) {
                console.log(chalk.red("❌ В прямом режиме обязательно укажите подтему через --section <id>"))
                console.log(
                    chalk.gray(
                        "Пример: jstrack apply keyboard-events --section sobytiya-keydown-i-keyup --commit abc123"
                    )
                )
                return
            }

            if (!options.commit) {
                console.log(chalk.red("❌ Обязательно укажите хеш коммита через --commit <hash>"))
                console.log(
                    chalk.gray(
                        "Пример: jstrack apply keyboard-events --section sobytiya-keydown-i-keyup --commit abc123"
                    )
                )
                return
            }
        }

        // ПРОВЕРКА ДУБЛИРОВАНИЯ: проверяем не существует ли уже такое применение
        console.log(chalk.blue("🔍 Проверяем на дублирование..."))
        const existingUsages = findCommitUsage(options.commit, options.project || getCurrentProjectName())
        const isAlreadyUsed = existingUsages.some(
            (usage) => usage.articleId === articleId && usage.sectionId === options.section
        )

        if (isAlreadyUsed) {
            console.log(chalk.red("❌ Это применение уже существует!"))
            console.log(chalk.gray("Один коммит можно привязать к подтеме только один раз"))

            console.log(chalk.yellow("📌 Существующие применения этого коммита:"))
            existingUsages.forEach((usage) => {
                const sectionInfo = usage.section ? ` (подтема: ${usage.section})` : ""
                console.log(chalk.gray(`   • ${usage.article}${sectionInfo}`))
            })

            return
        }

        // ОБЩАЯ ЛОГИКА ПРИМЕНЕНИЯ (ТОЛЬКО ДЛЯ ПОДТЕМ)
        const result = await executeApply(
            articleId,
            options.project || getCurrentProjectName(),
            options.commit,
            options.section,
            options.yes
        )

        if (result.success) {
            console.log(chalk.green.bold(`\n✅ Успешно применено!`))
            console.log(chalk.gray(`   Подтема: ${result.sectionTitle}`))
            console.log(`   📖 ${formatUrl(result.sectionUrl)}`)
            console.log(chalk.gray(`   Статья: ${result.articleTitle}`))
            console.log(`   📚 ${formatUrl(result.articleUrl)}`)
            console.log(chalk.gray(`   Проект: ${result.project}`))
            console.log(chalk.gray(`   Коммит: ${result.commit}`))

            // Показываем обновленный прогресс
            const progressResult = updateArticleProgress(articleId)
            if (progressResult && progressResult.success) {
                console.log(chalk.gray(`   Прогресс статьи: ${progressResult.progress}%`))
            }

            const knowledgeBase = getKnowledgeBase()

            saveKnowledgeBase(knowledgeBase, {
                type: "apply",
                section: result.sectionTitle,
                project: result.project,
            })
        }
    })

// Команда list - с ссылками
program
    .command("list")
    .description("List articles with filters")
    .option("-u, --unused", "Show only unused articles")
    .option("-l, --level <level>", "Filter by level")
    .option("-n, --number <count>", "Number of articles to show", "5")
    .action((options) => {
        console.log(chalk.blue.bold("\n📖 Статьи\n"))
        const knowledgeBase = getKnowledgeBase()
        const allArticles = getAllArticles(knowledgeBase)

        let articlesToShow = allArticles.filter((a) => a.level !== "syntax")

        if (options.unused) {
            articlesToShow = articlesToShow.filter((a) => (a.progress || 0) < 100)
            console.log(chalk.yellow("🟡 Неиспользованные статьи:\n"))
        } else if (options.level) {
            articlesToShow = articlesToShow.filter((a) => a.level === options.level)
            console.log(chalk.cyan(`${options.level.toUpperCase()} статьи:\n`))
        }

        const limitedArticles = articlesToShow.slice(0, parseInt(options.number))

        limitedArticles.forEach((article) => {
            const progress = article.progress || 0
            const statusIcon = progress === 100 ? "🟢" : progress > 0 ? "🟡" : "⚪"

            console.log(`  ${statusIcon} ${article.title}`)
            console.log(`    ID: ${article.id} | Прогресс: ${progress}%`)
            console.log(`    📚 ${formatUrl(article.url)}`)

            if (article.sections) {
                console.log(`    Подтем: ${article.sections.length}`)
            }
            console.log("")
        })

        console.log(chalk.magenta(`📊 Показано ${limitedArticles.length} из ${articlesToShow.length} статей`))
    })

// Команда view - детальный просмотр с ссылками
program
    .command("view <articleId>")
    .description("Show detailed view of article")
    .action((articleId) => {
        const knowledgeBase = getKnowledgeBase()
        const found = findArticleInCategories(knowledgeBase, articleId)

        if (!found) {
            console.log(chalk.red(`❌ Статья с ID "${articleId}" не найдена`))
            return
        }

        const { article } = found

        console.log(chalk.green.bold(`\n📚 ${article.title}`))
        console.log(chalk.gray(`ID: ${article.id} | Уровень: ${article.level}`))
        console.log(`📚 ${formatUrl(article.url)}`)

        const progress = calculateArticleProgress(article)
        console.log(`📊 Прогресс: ${createProgressBar(progress)} ${progress}%`)

        if (article.sections) {
            console.log(chalk.cyan(`\n📑 Подтемы:`))
            article.sections.forEach((section, index) => {
                const isApplied = section.applications && section.applications.length > 0
                const statusIcon = isApplied ? "🟢" : "⚪"
                console.log(`  ${statusIcon} ${section.title}`)
                console.log(`    ID: ${section.id}`)
                console.log(`    📖 ${formatUrl(section.url)}`)

                if (isApplied) {
                    console.log(`    Применения: ${section.applications.length}`)
                    section.applications.forEach((app, appIndex) => {
                        console.log(`      ${appIndex + 1}. ${app.project} - ${app.commit}`)
                    })
                }

                if (index < article.sections.length - 1) {
                    console.log("")
                }
            })
        }

        console.log(chalk.magenta(`\n🚀 Команды:`))
        console.log(chalk.gray(`  jstrack apply ${article.id} --section <id> --commit <hash>`))
        console.log(chalk.gray(`  jstrack study ${article.id}`))
    })
// Команда project - статьи по проекту с ссылками
program
    .command("project <projectName>")
    .description("Show articles applied in specific project")
    .action((projectName) => {
        console.log(chalk.blue.bold(`\n📁 Статьи в проекте "${projectName}":\n`))

        const projectArticles = getArticlesByProject(projectName)

        if (projectArticles.length === 0) {
            console.log(chalk.yellow(`  Нет примененных статей в проекте "${projectName}"`))
            console.log(chalk.gray(`  Используйте "jstrack apply --project ${projectName}" чтобы добавить статьи`))
            return
        }

        projectArticles.forEach((article) => {
            console.log(chalk.green(`• ${article.title}`))
            console.log(`  ID: ${chalk.yellow(article.id)}`)
            console.log(`  📚 ${formatUrl(article.url)}`)
            console.log(`  Уровень: ${article.level}`)

            // Показываем применения
            article.applications.forEach((app, index) => {
                const sectionInfo = app.section ? ` (подтема: ${app.section})` : ""
                console.log(`  ${index + 1}. Коммит: ${chalk.gray(app.commit)}${sectionInfo}`)
            })

            console.log(`  Всего применений: ${chalk.magenta(article.applicationCount)}`)
            console.log("")
        })

        console.log(chalk.magenta(`📊 Итого: ${projectArticles.length} статей`))
    })

// Команда stats - статистика
program
    .command("stats")
    .description("Show learning statistics")
    .action(() => {
        const knowledgeBase = getKnowledgeBase()

        // Получаем ВСЕ статьи из всех категорий
        const allArticles = getAllArticles(knowledgeBase)
        const totalArticles = allArticles.length

        const completed = allArticles.filter((a) => (a.progress || 0) === 100).length
        const inProgress = allArticles.filter((a) => (a.progress || 0) > 0 && (a.progress || 0) < 100).length
        const notStarted = allArticles.filter((a) => (a.progress || 0) === 0).length

        console.log(chalk.blue.bold("\n📊 Статистика обучения\n"))
        console.log(`🟢 Завершено: ${completed}/${totalArticles}`)
        console.log(`🟡 В процессе: ${inProgress}/${totalArticles}`)
        console.log(`⚪ Не начато: ${notStarted}/${totalArticles}`)

        // Дополнительная статистика
        const totalApplications = allArticles.reduce((total, article) => {
            const articleApps = article.applications?.length || 0
            const sectionApps =
                article.sections?.reduce((sum, section) => sum + (section.applications?.length || 0), 0) || 0
            return total + articleApps + sectionApps
        }, 0)

        console.log(chalk.cyan(`\n📈 Всего применений: ${totalApplications}`))

        // Прогресс в процентах
        const overallProgress = totalArticles > 0 ? Math.round((completed / totalArticles) * 100) : 0

        console.log(chalk.magenta(`🎯 Общий прогресс: ${overallProgress}%`))
        console.log(chalk.gray(`   ${createProgressBar(overallProgress)}`))

        if (completed > 0) {
            console.log(chalk.green("\n🎉 Отличный прогресс! Продолжай в том же духе! 🚀"))
        } else if (inProgress > 0) {
            console.log(chalk.yellow("\n💪 Ты на правильном пути! Продолжай изучать JavaScript!"))
        } else {
            console.log(chalk.blue("\n🚀 Начни своё путешествие в JavaScript! Выбери первую статью: jstrack list"))
        }
    })

// Команда suggest - AI рекомендации с ссылками
program
    .command("suggest <feature>")
    .description("Get AI suggestions for implementing a feature")
    .option("-p, --project-type <type>", "Project type", "web")
    .action(async (feature, options) => {
        console.log(chalk.blue.bold(`\n🎯 Рекомендации для: "${feature}"\n`))

        const suggestion = aiSuggestWithPlan(feature, options.projectType)

        if (suggestion.articles.length === 0) {
            console.log(chalk.yellow("🤔 Не найдено подходящих статей"))
            return
        }

        console.log(chalk.cyan("📚 Рекомендуемые статьи:\n"))
        suggestion.articles.forEach((article, index) => {
            console.log(chalk.green(`${index + 1}. ${article.title}`))
            console.log(chalk.gray(`   ID: ${article.id} | Уровень: ${article.level}`))
            console.log(`   📚 ${formatUrl(article.url)}`)

            if (article.sections && article.sections.length > 0) {
                console.log(chalk.blue("   🎯 Релевантные подтемы:"))
                article.sections.slice(0, 3).forEach((section) => {
                    console.log(chalk.gray(`      • ${section.title}`))
                    console.log(`        📖 ${formatUrl(section.url)}`)
                })
            }
            console.log("")
        })

        console.log(chalk.magenta("🚀 Действия:"))
        console.log(chalk.gray("   1. Изучите рекомендованные статьи"))
        console.log(chalk.gray("   2. Реализуйте в проекте"))
        console.log(chalk.gray("   3. Отмечайте прогресс: jstrack apply <id> --commit <hash>"))
    })

// Команда workflow - гайд по использованию
program
    .command("workflow")
    .description("Show usage workflow")
    .action(() => {
        console.log(chalk.blue.bold("\n🚀 Гайд по использованию\n"))

        console.log(chalk.green("🎯 Основные команды:"))
        console.log("  jstrack apply                    - Интерактивное применение")
        console.log("  jstrack search <запрос>          - Поиск статей")
        console.log("  jstrack list --unused            - Неиспользованные статьи")
        console.log("  jstrack view <id>                - Детали статьи")
        console.log("  jstrack stats                    - Статистика\n")

        console.log(chalk.cyan("💡 Примеры:"))
        console.log(chalk.gray("  $ jstrack apply"))
        console.log(chalk.gray("  $ jstrack search 'события клавиатуры'"))
        console.log(chalk.gray("  $ jstrack apply events --commit abc123"))
        console.log(chalk.gray("  $ jstrack list --unused"))
    })

// Обновленная вспомогательная функция для apply
async function executeApply(articleId, project, commit, sectionId, skipConfirmation = false) {
    if (!commit) {
        console.log(chalk.red("❌ Хеш коммита обязателен!"))
        return { success: false }
    }

    // ВОССТАНАВЛИВАЕМ ПРОВЕРКИ ПРОЕКТА И КОММИТА
    console.log(chalk.blue("🔍 Проверяем проект на GitHub..."))
    const projectValidation = await validateProjectExists(project)

    if (!projectValidation.exists && !projectValidation.skipCheck) {
        console.log(chalk.red.bold(`❌ Проект "${project}" не найден на GitHub!`))
        console.log(chalk.gray("   Проверь название репозитория"))
        return { success: false }
    }

    if (projectValidation.exists && !projectValidation.skipCheck) {
        console.log(chalk.green("✅ Проект найден на GitHub"))

        // Проверяем коммит
        console.log(chalk.blue("🔍 Проверяем коммит на GitHub..."))
        const commitValidation = await validateCommitExists(project, commit)

        if (!commitValidation.exists && !commitValidation.skipCheck) {
            console.log(chalk.red.bold(`❌ Коммит "${commit}" не найден в проекте "${project}"!`))
            console.log(chalk.gray("   Проверь хеш коммита"))
            return { success: false }
        }

        if (commitValidation.exists && !commitValidation.skipCheck) {
            console.log(chalk.green("✅ Коммит найден"))
        }
    }

    // Проверяем статью - ИСПОЛЬЗУЕМ findArticleInCategories
    const knowledgeBase = getKnowledgeBase()
    const found = findArticleInCategories(knowledgeBase, articleId)

    if (!found) {
        console.log(chalk.red(`❌ Статья с ID "${articleId}" не найдена`))
        console.log(chalk.gray('Используй "jstrack list" чтобы увидеть все статьи'))
        return { success: false }
    }

    const { article } = found
    console.log(chalk.green(`✅ Найдена статья: ${article.title}`))

    // Проверяем подтему
    let sectionInfo = null
    if (sectionId && article.sections) {
        sectionInfo = article.sections.find((s) => s.id === sectionId)
        if (!sectionInfo) {
            console.log(chalk.red(`❌ Подтема с ID "${sectionId}" не найдена`))
            return { success: false }
        }
        console.log(chalk.green(`✅ Найдена подтема: ${sectionInfo.title}`))
    } else {
        console.log(chalk.red("❌ Не указана подтема"))
        return { success: false }
    }

    // Подтверждение
    if (!skipConfirmation) {
        console.log(chalk.yellow("\n📝 Подтверждение:"))
        console.log(chalk.white(`   Статья: ${article.title}`))
        console.log(`   📚 ${formatUrl(article.url)}`)
        console.log(chalk.white(`   Подтема: ${sectionInfo.title}`))
        console.log(`   📖 ${formatUrl(sectionInfo.url)}`)
        console.log(chalk.white(`   Проект: ${project}`))
        console.log(chalk.white(`   Коммит: ${commit}`))

        const confirmed = await askForConfirmation(chalk.yellow("\n✅ Добавить связь? (y/N) "))
        if (!confirmed) {
            console.log(chalk.gray("❌ Отменено"))
            return { success: false }
        }
    }

    // Сохраняем
    const result = markAsApplied(articleId, project, commit, sectionId)
    if (result.success) {
        return {
            success: true,
            articleTitle: article.title,
            articleUrl: article.url,
            sectionTitle: sectionInfo.title,
            sectionUrl: sectionInfo.url,
            project,
            commit,
        }
    } else {
        console.log(chalk.red("❌ Ошибка при сохранении"))
        return { success: false }
    }
}

// Добавляем в программу команду unapply
program
    .command("unapply")
    .description("Remove application of knowledge to commit")
    .option("-c, --commit <commit>", "Commit hash to remove")
    .option("-a, --article <articleId>", "Article ID")
    .option("-s, --section <sectionId>", "Section ID")
    .option("--yes", "Skip confirmation prompt")
    .action(async (options) => {
        console.log(chalk.blue.bold("\n🗑️  Удаление применения\n"))

        const knowledgeBase = getKnowledgeBase()

        // РЕЖИМ 1: Интерактивный поиск применений для удаления
        if (!options.commit && !options.article) {
            await interactiveUnapply(knowledgeBase, options)
            return
        }

        // РЕЖИМ 2: Прямое удаление по критериям
        await directUnapply(knowledgeBase, options)
    })

// Интерактивный режим удаления
async function interactiveUnapply(knowledgeBase, options) {
    try {
        // Собираем все применения
        const allApplications = getAllApplications(knowledgeBase)

        if (allApplications.length === 0) {
            console.log(chalk.yellow("🤷 Нет применений для удаления"))
            return
        }

        console.log(chalk.cyan(`📚 Найдено применений: ${allApplications.length}\n`))

        // Показываем список применений
        let optionNumber = 1
        const optionsMap = new Map()

        allApplications.forEach((app, index) => {
            console.log(chalk.blue(`${optionNumber}. ${app.sectionTitle}`))
            console.log(chalk.gray(`   Статья: ${app.articleTitle}`))
            console.log(chalk.gray(`   ID: ${app.articleId} --section ${app.sectionId}`))
            console.log(chalk.gray(`   Коммит: ${app.commit} | Проект: ${app.project}`))
            console.log(chalk.gray(`   Дата: ${new Date(app.date).toLocaleDateString()}`))
            console.log(`   📖 ${formatUrl(app.sectionUrl)}`)

            optionsMap.set(optionNumber.toString(), app)
            optionNumber++
            console.log("")
        })

        const choice = await askQuestion(
            `Выберите применение для удаления (1-${optionNumber - 1}) или "all" для всех: `
        )

        let removedCount = 0
        const affectedArticles = new Set()
        let sectionTitleForContext = "multiple sections" // 🔥 ОПРЕДЕЛЯЕМ ПЕРЕМЕННУЮ ЗАРАНЕЕ

        if (choice.toLowerCase() === "all") {
            // Удаление всех применений
            console.log(chalk.red("⚠️  Вы собираетесь удалить ВСЕ применения!"))
            const proceed = options.yes || (await askForConfirmation("Продолжить? (y/N) "))

            if (!proceed) {
                console.log(chalk.gray("❌ Отменено"))
                return
            }

            // Удаляем все применения
            allApplications.forEach((app) => {
                if (removeApplication(knowledgeBase, app.articleId, app.sectionId, app.commit)) {
                    removedCount++
                    affectedArticles.add(app.articleId)
                }
            })

            console.log(chalk.green(`✅ Удалено применений: ${removedCount}`))
            sectionTitleForContext = "all applications" // 🔥 УСТАНАВЛИВАЕМ ДЛЯ КОНТЕКСТА
        } else if (optionsMap.has(choice)) {
            // Удаление одного применения
            const selected = optionsMap.get(choice)

            console.log(chalk.yellow(`⚠️  Удаляем применение:`))
            console.log(chalk.gray(`   Подтема: ${selected.sectionTitle}`))
            console.log(chalk.gray(`   Коммит: ${selected.commit}`))

            const proceed = options.yes || (await askForConfirmation("Продолжить? (y/N) "))

            if (!proceed) {
                console.log(chalk.gray("❌ Отменено"))
                return
            }

            if (removeApplication(knowledgeBase, selected.articleId, selected.sectionId, selected.commit)) {
                removedCount++
                affectedArticles.add(selected.articleId)
                sectionTitleForContext = selected.sectionTitle // 🔥 СОХРАНЯЕМ НАЗВАНИЕ ПОДТЕМЫ
                console.log(chalk.green("✅ Применение удалено"))
            } else {
                console.log(chalk.red("❌ Не удалось удалить применение"))
            }
        } else {
            console.log(chalk.red("❌ Неверный выбор"))
            return
        }

        // 🔥 ВАЖНО: Сохраняем и обновляем прогресс ТОЛЬКО ОДИН РАЗ после всех изменений
        if (removedCount > 0) {
            // Обновляем прогресс для затронутых статей
            affectedArticles.forEach((articleId) => {
                updateArticleProgress(articleId)
            })

            // 🔥 Сохраняем базу знаний ОДИН РАЗ с контекстом
            saveKnowledgeBase(knowledgeBase, {
                type: "unapply",
                section: sectionTitleForContext, // 🔥 ИСПОЛЬЗУЕМ ОПРЕДЕЛЕННУЮ ПЕРЕМЕННУЮ
            })
        }
    } catch (error) {
        console.log(chalk.red("❌ Ошибка:"), error.message)
    }
}

// Прямое удаление по критериям
async function directUnapply(knowledgeBase, options) {
    if (!options.commit) {
        console.log(chalk.red("❌ Для прямого удаления укажите коммит через --commit <hash>"))
        return
    }

    // Ищем применения по критериям
    const applications = findApplications(knowledgeBase, options)

    if (applications.length === 0) {
        console.log(chalk.yellow("🤷 Применения не найдены"))
        console.log(chalk.gray("Критерии поиска:"))
        if (options.commit) console.log(chalk.gray(`   Коммит: ${options.commit}`))
        if (options.article) console.log(chalk.gray(`   Статья: ${options.article}`))
        if (options.section) console.log(chalk.gray(`   Подтема: ${options.section}`))
        return
    }

    console.log(chalk.cyan(`📚 Найдено применений: ${applications.length}\n`))

    applications.forEach((app, index) => {
        console.log(chalk.blue(`${index + 1}. ${app.sectionTitle}`))
        console.log(chalk.gray(`   Статья: ${app.articleTitle}`))
        console.log(chalk.gray(`   ID: ${app.articleId} --section ${app.sectionId}`))
        console.log(chalk.gray(`   Коммит: ${app.commit} | Проект: ${app.project}`))
        console.log("")
    })

    const proceed = options.yes || (await askForConfirmation(`Удалить ${applications.length} применение(й)? (y/N) `))

    if (!proceed) {
        console.log(chalk.gray("❌ Отменено"))
        return
    }

    // Удаляем применения
    let removedCount = 0
    const affectedArticles = new Set()

    applications.forEach((app) => {
        if (removeApplication(knowledgeBase, app.articleId, app.sectionId, app.commit)) {
            removedCount++
            affectedArticles.add(app.articleId)
        }
    })

    console.log(chalk.green(`✅ Удалено применений: ${removedCount}`))

    // 🔥 ВАЖНО: Сохраняем и обновляем прогресс ТОЛЬКО ОДИН РАЗ после всех изменений
    if (removedCount > 0) {
        // Обновляем прогресс для затронутых статей
        affectedArticles.forEach((articleId) => {
            updateArticleProgress(articleId)
        })

        // 🔥 Определяем sectionTitle для контекста
        let sectionTitleForContext = applications.length === 1 ? applications[0].sectionTitle : "multiple sections"

        // 🔥 Сохраняем базу знаний ОДИН РАЗ с контекстом
        saveKnowledgeBase(knowledgeBase, {
            type: "unapply",
            section: sectionTitleForContext,
        })
    }
}
// Вспомогательные функции:

// Получить все применения из базы знаний
function getAllApplications(knowledgeBase) {
    const applications = []

    Object.values(knowledgeBase).forEach((category) => {
        if (category.articles) {
            category.articles.forEach((article) => {
                if (article.sections) {
                    article.sections.forEach((section) => {
                        if (section.applications) {
                            section.applications.forEach((app) => {
                                applications.push({
                                    articleId: article.id,
                                    articleTitle: article.title,
                                    sectionId: section.id,
                                    sectionTitle: section.title,
                                    sectionUrl: section.url,
                                    commit: app.commit,
                                    project: app.project,
                                    date: app.date,
                                })
                            })
                        }
                    })
                }
            })
        }
    })

    // Сортируем по дате (новые сначала)
    return applications.sort((a, b) => new Date(b.date) - new Date(a.date))
}

// Найти применения по критериям
function findApplications(knowledgeBase, criteria) {
    const applications = []

    Object.values(knowledgeBase).forEach((category) => {
        if (category.articles) {
            category.articles.forEach((article) => {
                // Проверка по статье
                if (criteria.article && article.id !== criteria.article) {
                    return
                }

                if (article.sections) {
                    article.sections.forEach((section) => {
                        // Проверка по подтеме
                        if (criteria.section && section.id !== criteria.section) {
                            return
                        }

                        if (section.applications) {
                            section.applications.forEach((app) => {
                                // Проверка по коммиту
                                if (app.commit === criteria.commit) {
                                    applications.push({
                                        articleId: article.id,
                                        articleTitle: article.title,
                                        sectionId: section.id,
                                        sectionTitle: section.title,
                                        sectionUrl: section.url,
                                        commit: app.commit,
                                        project: app.project,
                                        date: app.date,
                                    })
                                }
                            })
                        }
                    })
                }
            })
        }
    })

    return applications
}

// Удалить применение
// Удалить применение (только в памяти, без сохранения)
function removeApplication(knowledgeBase, articleId, sectionId, commit) {
    const article = findArticleInCategories(knowledgeBase, articleId)?.article

    if (!article || !article.sections) {
        return false
    }

    const section = article.sections.find((s) => s.id === sectionId)
    if (!section || !section.applications) {
        return false
    }

    const initialLength = section.applications.length
    section.applications = section.applications.filter((app) => app.commit !== commit)

    return section.applications.length < initialLength
}

// Обновить прогресс всех статей
function updateAllArticlesProgress(knowledgeBase) {
    Object.values(knowledgeBase).forEach((category) => {
        if (category.articles) {
            category.articles.forEach((article) => {
                updateArticleProgress(article.id)
            })
        }
    })
}

program.parse()
