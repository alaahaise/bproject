import { useEffect, useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { ArticleCatalogGroup, ArticleOption } from '@shared/types'
import { api, call } from '../api'
import { useI18n } from '../i18n'
import Icon from './Icon'

const VISIBLE_ARTICLES = 8

function optionValue(article: ArticleOption): string {
  return (article.code ?? article.name ?? '').slice(0, 64)
}

/** Search HFSQL articles while preserving manual product entry as a fallback. */
export default function ArticlePicker({
  value,
  group,
  onChange,
  disabled,
  ariaLabel
}: {
  value: string
  group: ArticleCatalogGroup
  onChange: (value: string) => void
  disabled?: boolean
  ariaLabel: string
}) {
  const { t } = useI18n()
  const id = `article-picker-${useId().replace(/:/g, '')}`
  const [query, setQuery] = useState(value)
  const [articles, setArticles] = useState<ArticleOption[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'offline'>('loading')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [selected, setSelected] = useState<ArticleOption | null>(null)

  // Keep the visible search field in sync with changes made by the parent form.
  // After choosing a catalogue result, keep its readable name in the field even
  // though the form stores the article code.
  useEffect(() => {
    if (selected && value === optionValue(selected)) return
    if (query !== value) setQuery(value)
    if (selected) setSelected(null)
  }, [query, selected, value])

  useEffect(() => {
    if (!open || disabled) return
    setArticles([])
    setState('loading')
    setActiveIndex(-1)
    let active = true
    const timer = setTimeout(() => {
      void call(api.bl.searchArticles(query, group))
        .then((results) => {
          if (!active) return
          setArticles(results)
          setState('ready')
        })
        .catch(() => {
          if (!active) return
          setArticles([])
          setState('offline')
        })
    }, 180)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [disabled, group, open, query])

  const visibleArticles = articles.slice(0, VISIBLE_ARTICLES)

  const choose = (article: ArticleOption): void => {
    const nextValue = optionValue(article)
    setSelected(article)
    setQuery(article.name ?? nextValue)
    setOpen(false)
    setActiveIndex(-1)
    onChange(nextValue)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
      setActiveIndex(-1)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) => Math.min(current + 1, visibleArticles.length - 1))
      return
    }

    if (event.key === 'ArrowUp' && open) {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
      return
    }

    if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault()
      const article = visibleArticles[activeIndex]
      if (article) choose(article)
    }
  }

  return (
    <div className="article-picker">
      <div className="article-picker-label-row">
        <label className="article-picker-label" htmlFor={`${id}-input`}>{ariaLabel}</label>
        <span id={`${id}-category`} className="article-picker-category">
          {t(`article.category.${group}`)}
        </span>
      </div>
      <div className="article-picker-control">
        <Icon name="search" size={20} className="article-picker-search-icon" />
        <input
          id={`${id}-input`}
          aria-autocomplete="list"
          aria-controls={`${id}-options`}
          aria-describedby={`${id}-category`}
          aria-expanded={open}
          aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
          autoComplete="off"
          maxLength={64}
          placeholder={t('lines.placeholder')}
          role="combobox"
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            const nextValue = event.target.value
            setQuery(nextValue)
            setSelected(null)
            setActiveIndex(-1)
            onChange(nextValue)
          }}
        />
      </div>

      {selected && (
        <div className="article-picker-selected" role="status">
          <Icon name="check-circle" size={18} />
          <span className="article-picker-selected-label">{t('article.selected')}:</span>
          <strong>{selected.name ?? optionValue(selected)}</strong>
          {selected.code && selected.code !== selected.name && (
            <span className="article-picker-code">{selected.code}</span>
          )}
        </div>
      )}

      {open && !disabled && (
        <div className="article-picker-panel">
          <div className="article-picker-panel-head">
            <strong>{t('article.results')}</strong>
            <span>{t('article.searchHint')}</span>
          </div>

          {state === 'loading' && (
            <p className="article-picker-message" role="status">{t('article.loading')}</p>
          )}
          {state === 'offline' && (
            <p className="article-picker-message" role="status">{t('article.unavailable')}</p>
          )}
          {state === 'ready' && articles.length === 0 && (
            <p className="article-picker-message" role="status">{t('article.noResults')}</p>
          )}

          {visibleArticles.length > 0 && (
            <div id={`${id}-options`} className="article-picker-options" role="listbox">
              {visibleArticles.map((article, index) => {
                const key = optionValue(article)
                return (
                  <button
                    id={`${id}-option-${index}`}
                    key={article.id}
                    type="button"
                    className={`article-picker-option${activeIndex === index ? ' is-active' : ''}`}
                    role="option"
                    aria-selected={activeIndex === index}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => choose(article)}
                  >
                    <span className="article-picker-option-name">{article.name ?? key}</span>
                    {article.code && article.code !== article.name && (
                      <span className="article-picker-code">{article.code}</span>
                    )}
                    <Icon name="chevron" size={18} />
                  </button>
                )
              })}
            </div>
          )}

          {articles.length > VISIBLE_ARTICLES && (
            <p className="article-picker-more">{t('article.moreHint')}</p>
          )}
          <p className="article-picker-manual">{t('article.manualHint')}</p>
        </div>
      )}
    </div>
  )
}
