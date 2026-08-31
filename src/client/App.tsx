import { useState } from 'react'
import { type Lang, useLang } from './i18n/index.js'
import { Portfolio } from './screens/portfolio/index.js'
import { Taxes } from './screens/taxes/index.js'

const SCREENS = ['portfolio', 'taxes'] as const
const LANGS: readonly Lang[] = ['cs', 'en']

export function App() {
  const { t, lang, setLang } = useLang()
  const [screen, setScreen] = useState<(typeof SCREENS)[number]>('portfolio')

  return (
    <div className="shell">
      <header className="masthead">
        <h1>
          invest<span className="tick">.</span>
        </h1>
        <nav>
          {SCREENS.map((name) => (
            <button
              key={name}
              type="button"
              className={`nav-link ${screen === name ? 'active' : ''}`}
              onClick={() => setScreen(name)}
            >
              {t(`nav.${name}`)}
            </button>
          ))}
          <fieldset className="lang-switch">
            <legend className="visually-hidden">{t('lang.label')}</legend>
            {LANGS.map((code) => (
              <button
                key={code}
                type="button"
                className={`nav-link ${lang === code ? 'active' : ''}`}
                onClick={() => setLang(code)}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </fieldset>
        </nav>
      </header>
      {screen === 'portfolio' ? <Portfolio /> : <Taxes />}
    </div>
  )
}
