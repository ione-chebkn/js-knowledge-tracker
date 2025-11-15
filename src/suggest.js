// src/suggest.js
import { loadKnowledgeBase, saveKnowledgeBase } from "./storage.js"
import chalk from "chalk"
// Все функции теперь работают через storage
export function getKnowledgeBase() {
    const knowledgeBase = loadKnowledgeBase() || {}

    // Если данные в формате с категориями и articles, преобразуем в плоский формат
    const firstKey = Object.keys(knowledgeBase)[0]
    const firstItem = knowledgeBase[firstKey]

    if (firstItem && firstItem.articles) {
        console.log(chalk.yellow("🔄 Обнаружен формат с категориями. Конвертируем в плоский..."))
        return convertCategoryFormat(knowledgeBase)
    }

    return knowledgeBase
}

function convertCategoryFormat(categoryData) {
    const flatData = {}

    Object.values(categoryData).forEach((category) => {
        if (category.articles && Array.isArray(category.articles)) {
            category.articles.forEach((article) => {
                flatData[article.id] = {
                    id: article.id,
                    title: article.title,
                    url: article.url,
                    level: article.level || "concept",
                    sections: article.sections || [],
                    progress: article.progress || 0,
                    applications: article.applications || [],
                }
            })
        }
    })

    console.log(chalk.green(`✅ Сконвертировано статей: ${Object.keys(flatData).length}`))
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
    if (!knowledgeBase || Object.keys(knowledgeBase).length === 0) {
        console.log("📝 База знаний пуста. Заполни её в js-knowledge-data репо!")
        return []
    }

    const unused = []

    // Обходим все статьи в плоском формате
    Object.values(knowledgeBase).forEach((article) => {
        // Проверяем прогресс и применения
        const hasApplications = article.applications && article.applications.length > 0
        const hasSectionApplications =
            article.sections &&
            article.sections.some((section) => section.applications && section.applications.length > 0)

        if ((article.progress || 0) < 100 && !hasApplications && !hasSectionApplications) {
            unused.push({
                id: article.id,
                title: article.title,
                url: article.url,
                level: article.level,
                progress: article.progress || 0,
                sections: article.sections || [],
            })
        }
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
export function markAsApplied(articleId, project = null, commit = null, sectionId = null) {
    return updateKnowledgeBase((knowledgeBase) => {
        const article = knowledgeBase[articleId]
        if (article) {
            // Обновляем прогресс статьи
            article.progress = 100

            // Добавляем применение в конкретную секцию или в основную статью
            if (project && commit) {
                let targetSection

                if (sectionId && article.sections) {
                    targetSection = article.sections.find((s) => s.id === sectionId)
                }

                const applicationsArray = targetSection ? targetSection.applications || [] : article.applications || []

                // Проверяем, нет ли уже такого применения
                const existingApplication = applicationsArray.find(
                    (app) => app.project === project && app.commit === commit
                )

                if (!existingApplication) {
                    const newApplication = {
                        project: project,
                        commit: commit,
                        commitUrl: `https://github.com/${project}/commit/${commit}`,
                    }

                    applicationsArray.push(newApplication)

                    // Сохраняем обратно в статью или секцию
                    if (targetSection) {
                        targetSection.applications = applicationsArray
                    } else {
                        article.applications = applicationsArray
                    }
                }
            }

            return { success: true, article }
        }
        return { success: false }
    })
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
    const applied = Object.values(knowledgeBase).filter((article) => article.progress === 100)

    // Собираем информацию о применениях
    return applied.map((article) => {
        const applications = []
        let totalApplications = 0

        // Применения в основной статье
        if (article.applications) {
            applications.push(...article.applications)
            totalApplications += article.applications.length
        }

        // Применения в секциях
        if (article.sections) {
            article.sections.forEach((section) => {
                if (section.applications) {
                    applications.push(
                        ...section.applications.map((app) => ({
                            ...app,
                            section: section.title,
                        }))
                    )
                    totalApplications += section.applications.length
                }
            })
        }

        return {
            ...article,
            applications: applications,
            applicationCount: totalApplications,
            projects: [...new Set(applications.map((app) => app.project))],
        }
    })
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

export function findCommitUsage(commit, targetProject = null) {
    const knowledgeBase = getKnowledgeBase()
    const usages = []

    // Ищем где используется этот коммит
    Object.values(knowledgeBase).forEach((article) => {
        // Проверяем применения в основной статье
        if (article.applications) {
            article.applications.forEach((app) => {
                if (app.commit === commit && (!targetProject || app.project === targetProject)) {
                    usages.push({
                        article: article.title,
                        articleId: article.id,
                        project: app.project,
                        section: null, // Основная статья
                    })
                }
            })
        }

        // Проверяем применения в секциях
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

/**
 * Получить все статьи примененные в конкретном проекте
 */
export function getArticlesByProject(projectName) {
    const knowledgeBase = getKnowledgeBase()
    const projectArticles = []

    Object.values(knowledgeBase).forEach((article) => {
        const articleApplications = []

        // Применения в основной статье
        if (article.applications) {
            article.applications.forEach((app) => {
                if (app.project === projectName) {
                    articleApplications.push({
                        ...app,
                        section: null,
                        sectionId: null,
                    })
                }
            })
        }

        // Применения в секциях
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

/**
 * Получить прогресс по уровням
 */
export function getProgressByLevel() {
    const knowledgeBase = getKnowledgeBase()
    const levels = {}

    Object.values(knowledgeBase).forEach((article) => {
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
