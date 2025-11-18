// src/suggest.js
import { loadKnowledgeBase, saveKnowledgeBase } from "./storage.js"
import chalk from "chalk"
import path from "path"
import fs from "fs"
// Все функции теперь работают через storage
export function getKnowledgeBase() {
    const knowledgeBase = loadKnowledgeBase() || {}

    // // Тихий режим конвертации
    // const firstKey = Object.keys(knowledgeBase)[0]
    // const firstItem = knowledgeBase[firstKey]

    // if (firstItem && firstItem.articles) {
    //     return convertCategoryFormat(knowledgeBase)
    // }

    return knowledgeBase
}
// Вспомогательная функция для поиска статьи в категориях
export function findArticleInCategories(knowledgeBase, articleId) {
    for (const category of Object.values(knowledgeBase)) {
        if (category.articles) {
            const article = category.articles.find((a) => a.id === articleId)
            if (article) {
                return { article, category }
            }
        }
    }
    return null
}

function convertCategoryFormat(categoryData) {
    const flatData = {}
    let totalArticles = 0

    Object.values(categoryData).forEach((category) => {
        if (category.articles && Array.isArray(category.articles)) {
            category.articles.forEach((article) => {
                if (article.id && article.title) {
                    // Сохраняем ВСЕ данные из оригинала, включая применения
                    flatData[article.id] = {
                        id: article.id,
                        title: article.title,
                        url: article.url,
                        level: article.level || "concept",
                        sections: article.sections || [],
                        progress: article.progress || 0,
                        applications: article.applications || [],
                    }
                    totalArticles++
                }
            })
        }
    })

    // Покажем статистику по применениям
    const appliedArticles = Object.values(flatData).filter(
        (a) =>
            (a.applications && a.applications.length > 0) ||
            (a.sections && a.sections.some((s) => s.applications && s.applications.length > 0))
    )

    if (appliedArticles.length > 0) {
        console.log()
        console.log(chalk.cyan(`📊 Примененных статей: ${appliedArticles.length}`))
        console.log()
    }

    return flatData
}

export function updateKnowledgeBase(updater) {
    const knowledgeBase = loadKnowledgeBase() || {}
    const result = updater(knowledgeBase)
    if (saveKnowledgeBase(knowledgeBase)) {
        return result
    }
    return null
}

export function getUnusedArticles() {
    const knowledgeBase = getKnowledgeBase()
    const allArticles = getAllArticles(knowledgeBase)

    const unused = allArticles.filter((article) => {
        const hasApplications = article.applications && article.applications.length > 0
        const hasSectionApplications =
            article.sections &&
            article.sections.some((section) => section.applications && section.applications.length > 0)

        return (article.progress || 0) < 100 && !hasApplications && !hasSectionApplications
    })

    return unused
}

export function suggestByCategory() {
    const suggestions = {}
    const unused = getUnusedArticles()

    // Группируем по уровню (level)
    unused.forEach((article) => {
        const category = article.level || "unknown"
        if (!suggestions[category]) {
            suggestions[category] = []
        }
        suggestions[category].push(article)
    })

    return suggestions
}

export function aiSuggest(featureIdea = "") {
    const unused = getUnusedArticles()

    const keywordMap = {
        форма: ["events", "forms", "dom"],
        валидация: ["events", "forms", "regexp"],
        анимация: ["dom", "events", "timers"],
        состояние: ["closure", "object", "variables"],
        данные: ["object", "array", "json"],
        события: ["events", "dom"],
        полифилы: ["polyfills"],
        код: ["ninja", "style", "best-practices"],
    }

    const matchedKeywords = []
    for (const [keyword, topics] of Object.entries(keywordMap)) {
        if (featureIdea.toLowerCase().includes(keyword)) {
            matchedKeywords.push(...topics)
        }
    }

    const relevantArticles = unused.filter((article) =>
        matchedKeywords.some(
            (keyword) =>
                article.id.includes(keyword) ||
                article.title.toLowerCase().includes(keyword) ||
                (article.sections &&
                    article.sections.some(
                        (section) => section.id.includes(keyword) || section.title.toLowerCase().includes(keyword)
                    ))
        )
    )

    return relevantArticles.slice(0, 3)
}

// src/suggest.js
export function aiSuggestWithPlan(featureIdea = "", projectType = "web") {
    const unused = getUnusedArticles()

    // Более детальная карта фич -> шаги -> статьи
    const featureTemplates = {
        "валидация формы": {
            steps: [
                {
                    step: "1. Обработка событий формы",
                    description: "Научиться обрабатывать submit и input события",
                    articles: ["events", "forms", "event-delegation"],
                    keywords: ["submit", "input", "events"],
                },
                {
                    step: "2. Валидация полей в реальном времени",
                    description: "Валидация при вводе данных",
                    articles: ["forms", "regexp", "events"],
                    keywords: ["validation", "regexp", "input"],
                },
                {
                    step: "3. Кастомная валидация",
                    description: "Создание собственных правил валидации",
                    articles: ["functions", "conditions", "forms"],
                    keywords: ["custom", "validation", "rules"],
                },
                {
                    step: "4. Показать сообщения об ошибках",
                    description: "Динамическое отображение ошибок",
                    articles: ["dom", "modifying-document", "styles"],
                    keywords: ["error", "messages", "display"],
                },
            ],
        },
        "работа с api": {
            steps: [
                {
                    step: "1. Отправка HTTP запросов",
                    description: "Использование Fetch API для запросов",
                    articles: ["fetch", "ajax", "promises"],
                    keywords: ["fetch", "http", "requests"],
                },
                {
                    step: "2. Обработка ответов",
                    description: "Работа с промисами и обработка данных",
                    articles: ["promises", "json", "error-handling"],
                    keywords: ["promises", "response", "json"],
                },
                {
                    step: "3. Обработка ошибок",
                    description: "Грамотная обработка сетевых ошибок",
                    articles: ["error-handling", "promises", "try-catch"],
                    keywords: ["error", "handling", "catch"],
                },
            ],
        },
        "анимация интерфейса": {
            steps: [
                {
                    step: "1. CSS анимации",
                    description: "Базовые CSS transitions и animations",
                    articles: ["css-animations", "styles"],
                    keywords: ["css", "animation", "transition"],
                },
                {
                    step: "2. JavaScript анимации",
                    description: "Плавные анимации через JS",
                    articles: ["animations", "timers", "dom"],
                    keywords: ["javascript", "animation", "smooth"],
                },
                {
                    step: "3. Обработка событий анимации",
                    description: "События начала и окончания анимации",
                    articles: ["events", "animation-events"],
                    keywords: ["animationend", "events"],
                },
            ],
        },
    }

    // Находим подходящий шаблон
    const featureLower = featureIdea.toLowerCase()
    let matchedTemplate = null

    for (const [templateFeature, template] of Object.entries(featureTemplates)) {
        if (featureLower.includes(templateFeature)) {
            matchedTemplate = template
            break
        }
    }

    // Если нашли шаблон - генерируем детальный план
    if (matchedTemplate) {
        const planWithArticles = matchedTemplate.steps.map((step) => {
            // Находим подходящие статьи для этого шага
            const relevantArticles = unused
                .filter(
                    (article) =>
                        step.articles.some(
                            (articleKeyword) =>
                                article.id.includes(articleKeyword) ||
                                article.title.toLowerCase().includes(articleKeyword)
                        ) ||
                        step.keywords.some(
                            (keyword) =>
                                article.id.includes(keyword) ||
                                article.title.toLowerCase().includes(keyword) ||
                                (article.sections &&
                                    article.sections.some((section) => section.title.toLowerCase().includes(keyword)))
                        )
                )
                .slice(0, 2) // Берем до 2 самых релевантных статей

            return {
                ...step,
                articles: relevantArticles,
            }
        })

        return {
            feature: featureIdea,
            plan: planWithArticles,
            hasDetailedPlan: true,
        }
    }

    // Если шаблон не найден - используем старый подход
    const relevantArticles = aiSuggest(featureIdea, projectType)
    return {
        feature: featureIdea,
        articles: relevantArticles,
        hasDetailedPlan: false,
    }
}
// Обновленная markAsApplied для работы с оригинальным форматом
export function markAsApplied(articleId, project = null, commit = null, sectionId = null) {
    console.log(chalk.yellow("🚨 EMERGENCY MODE: Сохраняем напрямую..."))

    try {
        const targetPath = path.join(".js-knowledge-data", "knowledge-base.json")
        console.log(chalk.blue(`   Сохраняем в: ${path.resolve(targetPath)}`))

        // Загружаем оригинальный файл
        const originalData = JSON.parse(fs.readFileSync(targetPath, "utf8"))

        // Находим и обновляем статью
        let updated = false
        let targetArticle = null
        let targetSection = null

        Object.values(originalData).forEach((category) => {
            if (category.articles) {
                const article = category.articles.find((a) => a.id === articleId)
                if (article && article.sections) {
                    const section = article.sections.find((s) => s.id === sectionId)
                    if (section) {
                        if (!section.applications) section.applications = []

                        // ПРОВЕРКА ДУБЛИРОВАНИЯ: ищем существующее применение
                        const existingApplication = section.applications.find(
                            (app) => app.project === project && app.commit === commit
                        )

                        if (existingApplication) {
                            console.log(chalk.red(`   ❌ Применение уже существует!`))
                            console.log(chalk.gray(`      Проект: ${project}, Коммит: ${commit}`))
                            return { success: false, error: "Application already exists" }
                        }

                        // Добавляем новое применение
                        section.applications.push({
                            project: project,
                            commit: commit,
                            date: new Date().toISOString(),
                            commitUrl: `https://github.com/${project}/commit/${commit}`,
                        })
                        updated = true
                        targetArticle = article
                        targetSection = section
                        console.log(chalk.green(`   ✅ Применение добавлено к подтеме: ${section.title}`))
                    }
                }
            }
        })

        if (updated && targetArticle) {
            // ОБНОВЛЯЕМ ПРОГРЕСС
            const oldProgress = targetArticle.progress || 0
            const newProgress = calculateArticleProgress(targetArticle)
            targetArticle.progress = newProgress
            console.log(chalk.green(`   📊 Прогресс обновлен: ${oldProgress}% → ${newProgress}%`))

            // Сохраняем обратно
            fs.writeFileSync(targetPath, JSON.stringify(originalData, null, 2))
            console.log(chalk.green(`   ✅ Файл успешно обновлен!`))
            return { success: true }
        } else {
            console.log(chalk.red(`   ❌ Не удалось найти статью/подтему`))
            return { success: false }
        }
    } catch (error) {
        console.log(chalk.red(`   ❌ Ошибка: ${error.message}`))
        return { success: false }
    }
}

export function markAsStudied(articleId) {
    return updateKnowledgeBase((knowledgeBase) => {
        const article = knowledgeBase[articleId]
        if (article) {
            article.progress = 100
            return { success: true, article }
        }
        return { success: false }
    })
}

export function getAppliedArticles() {
    const knowledgeBase = getKnowledgeBase()
    // const applied = Object.values(knowledgeBase).filter((article) => article.progress === 100)

    // // Собираем информацию о применениях
    // return applied.map((article) => {
    //     const applications = []
    //     let totalApplications = 0

    //     // Применения в основной статье
    //     if (article.applications) {
    //         applications.push(...article.applications)
    //         totalApplications += article.applications.length
    //     }

    //     // Применения в секциях
    //     if (article.sections) {
    //         article.sections.forEach((section) => {
    //             if (section.applications) {
    //                 applications.push(
    //                     ...section.applications.map((app) => ({
    //                         ...app,
    //                         section: section.title,
    //                     }))
    //                 )
    //                 totalApplications += section.applications.length
    //             }
    //         })
    //     }

    //     return {
    //         ...article,
    //         applications: applications,
    //         applicationCount: totalApplications,
    //         projects: [...new Set(applications.map((app) => app.project))],
    //     }
    // })

    return knowledgeBase
}

export function isCommitAlreadyLinked(articleId, project, commit, sectionId = null) {
    const knowledgeBase = getKnowledgeBase()
    const article = knowledgeBase[articleId]

    if (!article) return false

    // Проверяем применения в основной статье
    if (article.applications) {
        const existsInArticle = article.applications.some((app) => app.project === project && app.commit === commit)
        if (existsInArticle) return true
    }

    // Проверяем применения в секциях
    if (article.sections) {
        const targetSection = sectionId ? article.sections.find((s) => s.id === sectionId) : null

        if (targetSection && targetSection.applications) {
            const existsInSection = targetSection.applications.some(
                (app) => app.project === project && app.commit === commit
            )
            if (existsInSection) return true
        }

        // Если sectionId не указан, проверяем все секции
        if (!sectionId) {
            const existsInAnySection = article.sections.some(
                (section) =>
                    section.applications &&
                    section.applications.some((app) => app.project === project && app.commit === commit)
            )
            if (existsInAnySection) return true
        }
    }

    return false
}

export function getAllArticles(knowledgeBase) {
    const articles = []
    Object.values(knowledgeBase).forEach((category) => {
        if (category.articles) {
            articles.push(...category.articles)
        }
    })
    return articles
}

export function findCommitUsage(commit, targetProject = null) {
    const knowledgeBase = getKnowledgeBase()
    const usages = []
    const allArticles = getAllArticles(knowledgeBase)

    allArticles.forEach((article) => {
        // Проверяем применения в подтемах
        if (article.sections) {
            article.sections.forEach((section) => {
                if (section.applications) {
                    section.applications.forEach((app) => {
                        if (app.commit === commit && (!targetProject || app.project === targetProject)) {
                            usages.push({
                                article: article.title,
                                articleId: article.id,
                                project: app.project,
                                section: section.title,
                                sectionId: section.id,
                            })
                        }
                    })
                }
            })
        }
    })

    return usages
}
export function getArticlesByProject(projectName) {
    const knowledgeBase = getKnowledgeBase()
    const projectArticles = []
    const allArticles = getAllArticles(knowledgeBase)

    allArticles.forEach((article) => {
        const articleApplications = []

        // Применения в подтемах
        if (article.sections) {
            article.sections.forEach((section) => {
                if (section.applications) {
                    section.applications.forEach((app) => {
                        if (app.project === projectName) {
                            articleApplications.push({
                                ...app,
                                section: section.title,
                                sectionId: section.id,
                            })
                        }
                    })
                }
            })
        }

        // Если есть применения в этом проекте, добавляем статью
        if (articleApplications.length > 0) {
            projectArticles.push({
                id: article.id,
                title: article.title,
                level: article.level,
                url: article.url,
                applications: articleApplications,
                applicationCount: articleApplications.length,
            })
        }
    })

    return projectArticles
}

export function getProgressByLevel() {
    const knowledgeBase = getKnowledgeBase()
    const levels = {}
    const allArticles = getAllArticles(knowledgeBase)

    allArticles.forEach((article) => {
        const level = article.level || "unknown"
        if (!levels[level]) {
            levels[level] = {
                total: 0,
                completed: 0,
                progress: 0,
            }
        }

        levels[level].total++
        if (article.progress === 100) {
            levels[level].completed++
        }
    })

    // Рассчитываем прогресс для каждого уровня
    Object.keys(levels).forEach((level) => {
        const data = levels[level]
        data.progress = Math.round((data.completed / data.total) * 100)
    })

    return levels
}

/**
 * Рассчитывает прогресс статьи на основе подтем
 */
export function calculateArticleProgress(article) {
    // Если нет подтем - используем прогресс статьи
    if (!article.sections || article.sections.length === 0) {
        return article.progress || 0
    }

    // Считаем количество подтем с применениями
    let appliedSections = 0

    article.sections.forEach((section) => {
        // Подтема считается примененной если есть хотя бы одно применение
        if (section.applications && section.applications.length > 0) {
            appliedSections++
        }
    })

    // Прогресс = (примененные подтемы / все подтемы) * 100
    const progress = Math.round((appliedSections / article.sections.length) * 100)

    console.log(chalk.gray(`   ${appliedSections}/${article.sections.length} подтем применено = ${progress}%`))

    return progress
}

/**
 * Статистика по статье
 */
export function getArticleStats(article) {
    const stats = {
        totalSections: article.sections ? article.sections.length : 0,
        completedSections: 0,
        appliedSections: 0,
    }

    if (article.sections) {
        article.sections.forEach((section) => {
            if (section.applications && section.applications.length > 0) {
                stats.appliedSections++
                stats.completedSections++
            } else if (article.progress === 100) {
                stats.completedSections++
            }
        })
    }

    return stats
}

/**
 * Создает прогресс-бар
 */
export function createProgressBar(progress, length = 20) {
    const filled = Math.round((progress / 100) * length)
    const empty = length - filled
    return "█".repeat(filled) + "░".repeat(empty)
}

/**
 * Обновляет прогресс статьи при применении подтемы
 */
export function updateArticleProgress(articleId) {
    console.log(chalk.blue(`📊 Обновляем прогресс для статьи ${articleId}...`))

    const knowledgeBase = getKnowledgeBase()
    const found = findArticleInCategories(knowledgeBase, articleId)

    if (!found) {
        console.log(chalk.red(`❌ Статья ${articleId} не найдена для обновления прогресса`))
        return { success: false }
    }

    const { article } = found
    const oldProgress = article.progress || 0

    // Рассчитываем новый прогресс
    const newProgress = calculateArticleProgress(article)
    article.progress = newProgress

    console.log(chalk.green(`✅ Прогресс обновлен: ${oldProgress}% → ${newProgress}%`))

    // Сохраняем изменения
    if (saveKnowledgeBase(knowledgeBase)) {
        return { success: true, progress: newProgress }
    } else {
        console.log(chalk.red("❌ Ошибка при сохранении прогресса"))
        return { success: false }
    }
}
