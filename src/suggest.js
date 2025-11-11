// src/suggest.js
import { loadKnowledgeBase, saveKnowledgeBase } from "./storage.js"

// Все функции теперь работают через storage
export function getKnowledgeBase() {
    return loadKnowledgeBase() || {}
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
    const knowledgeBase = getKnowledgeBase() // ← теперь из storage!
    if (!knowledgeBase || Object.keys(knowledgeBase).length === 0) {
        console.log("📝 База знаний пуста. Заполни её в js-knowledge-data репо!")
        return []
    }

    const unused = []
    Object.values(knowledgeBase).forEach((category) => {
        category.articles.forEach((article) => {
            if (!article.applied) {
                unused.push({
                    ...article,
                    category: category.title,
                })
            }
        })
    })
    return unused
}

// Остальные функции остаются без изменений...
export function suggestByCategory() {
    const suggestions = {}
    const unused = getUnusedArticles()

    unused.forEach((article) => {
        if (!suggestions[article.category]) {
            suggestions[article.category] = []
        }
        suggestions[article.category].push(article)
    })

    return suggestions
}

export function aiSuggest(featureIdea = "") {
    const unused = getUnusedArticles()

    const keywordMap = {
        форма: ["events", "forms"],
        валидация: ["events", "forms", "regexp"],
        анимация: ["dom", "events", "timers"],
        состояние: ["closure", "object", "variables"],
        данные: ["object", "array", "json"],
        события: ["events", "dom"],
    }

    const matchedKeywords = []
    for (const [keyword, topics] of Object.entries(keywordMap)) {
        if (featureIdea.toLowerCase().includes(keyword)) {
            matchedKeywords.push(...topics)
        }
    }

    const relevantArticles = unused.filter((article) => matchedKeywords.some((keyword) => article.id.includes(keyword)))

    return relevantArticles.slice(0, 3)
}

export function markAsApplied(articleId, project = null, commit = null) {
    return updateKnowledgeBase((knowledgeBase) => {
        for (const category of Object.values(knowledgeBase)) {
            const article = category.articles.find((a) => a.id === articleId)
            if (article) {
                article.applied = true
                article.status = "applied"

                if (project && commit) {
                    if (!article.applications) {
                        article.applications = {}
                    }
                    if (!article.applications[project]) {
                        article.applications[project] = []
                    }
                    if (!article.applications[project].includes(commit)) {
                        article.applications[project].push(commit)
                    }
                }

                // УДАЛИМ старые поля если вдруг появятся
                if (article.projects) delete article.projects
                if (article.commits) delete article.commits

                return { success: true, article }
            }
        }
        return { success: false }
    })
}

export function markAsStudied(articleId) {
    return updateKnowledgeBase((knowledgeBase) => {
        for (const category of Object.values(knowledgeBase)) {
            const article = category.articles.find((a) => a.id === articleId)
            if (article) {
                article.status = "studied"
                return { success: true, article }
            }
        }
        return { success: false }
    })
}

export function getAppliedArticles() {
    const knowledgeBase = getKnowledgeBase()
    const applied = Object.values(knowledgeBase)
        .flatMap((category) => category.articles)
        .filter((article) => article.applied)

    // Добавим информацию о применениях
    return applied.map((article) => ({
        ...article,
        applicationCount: article.applications ? Object.keys(article.applications).length : 0,
        projects: article.applications ? Object.keys(article.applications) : [],
    }))
}

export function isCommitAlreadyLinked(articleId, project, commit) {
    const knowledgeBase = getKnowledgeBase()

    // Ищем статью
    for (const category of Object.values(knowledgeBase)) {
        const article = category.articles.find((a) => a.id === articleId)
        if (article && article.applications) {
            // Проверяем есть ли уже этот коммит в ЭТОЙ СТАТЬЕ и ЭТОМ ПРОЕКТЕ
            if (article.applications[project] && article.applications[project].includes(commit)) {
                return true
            }
        }
    }
    return false
}

export function findCommitUsage(commit, targetProject = null) {
    const knowledgeBase = getKnowledgeBase()
    const usages = []

    // Ищем где используется этот коммит
    Object.values(knowledgeBase).forEach((category) => {
        category.articles.forEach((article) => {
            if (article.applications) {
                Object.entries(article.applications).forEach(([project, commits]) => {
                    // Если указан проект, ищем только в нем, иначе во всех
                    if ((!targetProject || project === targetProject) && commits.includes(commit)) {
                        usages.push({
                            article: article.title,
                            articleId: article.id,
                            project: project,
                        })
                    }
                })
            }
        })
    })

    return usages
}
