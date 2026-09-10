// The only file in src/ that carries Czech text. Everything else - code, comments, warning codes -
// is English, so translations live in exactly one place per language.

export const cs = {
  'nav.portfolio': 'Portfolio',
  'nav.taxes': 'Daně',
  'lang.label': 'Jazyk',

  'common.loading': 'Načítám…',
  'common.save': 'Uložit',
  'common.delete': 'Smazat',
  'common.confirmDelete': 'Opravdu smazat?',
  'common.export': 'Stáhnout CSV',
  'common.none': '—',
  'common.yes': 'ano',
  'common.no': 'ne',
  'common.records': '{total} záznamů',
  'common.page': 'str. {page}/{pages}',

  'broker.T212': 'Trading 212',
  'broker.F24': 'Freedom24',

  'portfolio.loadError': 'Portfolio se nepodařilo načíst: {error}. Běží server (pnpm dev)?',
  'portfolio.card.cash': 'hotovost',
  'portfolio.card.unrealized': 'nerealizované',
  'portfolio.card.positions': 'pozic',
  'benchmark.label': 'Vs. S&P 500',
  'benchmark.hint':
    'Každý vklad přehraný do S&P 500 (total return) ve stejný den, přes kurz ČNB. Hladina = co by z týchž peněz udělal index.',
  'benchmark.ahead': 'porážíš index o {pct} %',
  'benchmark.behind': 'index vede o {pct} %',
  'benchmark.even': 'vyrovnáno s indexem',
  'benchmark.level': 'hladina',
  'benchmark.portfolio': 'portfolio',
  'benchmark.invested': 'vloženo',
  'benchmark.annual': 'p.a. ty {mine} % · index {index} % · rozdíl {alpha} p. b.',
  'benchmark.period': 'od {since} k {asOf}',
  'benchmark.noFlows': 'Zatím žádné vklady — po syncu T212 se tu objeví srovnání s indexem.',
  'benchmark.noValuation': 'Chybí ocenění portfolia — spusť sync T212.',
  'benchmark.loadError': 'Srovnání s indexem se nepodařilo načíst: {error}',
  'portfolio.sync.start': 'Synchronizovat T212',
  'portfolio.sync.running': 'Synchronizuji…',
  'portfolio.sync.starting': 'Startuji…',
  'portfolio.sync.progress':
    'Stahuji {phase} — stránek {pages}, +{lots} nákupů, +{sales} prodejů, +{dividends} dividend, +{transactions} transakcí · {seconds} s',
  'portfolio.sync.done':
    'Sync hotový: {positions} pozic, +{lots} nákupů, +{sales} prodejů, +{dividends} dividend, +{transactions} transakcí.',
  'portfolio.phase.summary': 'souhrn účtu',
  'portfolio.phase.positions': 'pozice',
  'portfolio.phase.orders': 'historii objednávek',
  'portfolio.phase.dividends': 'dividendy',
  'portfolio.phase.transactions': 'transakce',

  'portfolio.positions.title': 'Pozice',
  'portfolio.positions.hint': 'Napříč brokery; alokace se počítá v rámci účtu a měny.',
  'portfolio.positions.empty': 'Zatím žádné pozice — spusť sync T212 nebo přidej nákup ručně níže.',
  'portfolio.col.instrument': 'Titul',
  'portfolio.col.broker': 'Broker',
  'portfolio.col.quantity': 'Ks',
  'portfolio.col.avgPrice': 'Prům. cena',
  'portfolio.col.price': 'Akt. cena',
  'portfolio.col.value': 'Hodnota',
  'portfolio.col.pnl': 'P/L',
  'portfolio.col.allocation': 'Alokace',
  'portfolio.col.newPrice': 'Nová cena',
  'portfolio.col.date': 'Datum',
  'portfolio.col.purchase': 'Nákup',

  'portfolio.manual.title': 'Ruční evidence',
  'portfolio.manual.hint':
    'Freedom24 nemá API — pozice se zadávají ručně (broker F24) a cena se doplňuje u pozice. Broker T212 slouží jen k doplnění nákupu chybějícího v historii (např. reinvest); T212 pozice jinak plní sync.',
  'portfolio.manual.ticker': 'Ticker',
  'portfolio.manual.name': 'Název',
  'portfolio.manual.currency': 'Měna',
  'portfolio.manual.quantity': 'Množství',
  'portfolio.manual.price': 'Cena / ks',
  'portfolio.manual.date': 'Datum nákupu',
  'portfolio.manual.broker': 'Broker',
  'portfolio.manual.brokerT212': 'T212 (oprava díry)',
  'portfolio.manual.submit': 'Přidat nákup',

  'taxes.loadError': 'Daňový přehled se nepodařilo načíst: {error}',
  'taxes.yearUnsupported': 'Rok {year} zatím nemá daňové konstanty.',
  'taxes.loading': 'Počítám daňový přehled…',
  'taxes.tab.sales': 'Prodeje ({count})',
  'taxes.tab.dividends': 'Dividendy ({count})',
  'taxes.tab.lots': 'Časový test ({count})',
  'taxes.tab.tax': 'Daň',

  'taxes.card.proceeds': 'Příjmy z prodeje {year}',
  'taxes.card.under100k': 'pod limitem {limit} — vše osvobozeno',
  'taxes.card.over100k': 'nad limitem {limit} — daní se prodeje bez časového testu',
  'taxes.card.limitBase': 'do limitu se počítá {amount}',
  'taxes.card.taxableGain': 'Zdanitelný zisk z prodejů',
  'taxes.card.proceedsMinusCost': 'příjmy {proceeds} − náklady {cost}',
  'taxes.card.loss': 'ztráta, základ §10 je 0',
  'taxes.card.dividends': 'Dividendy {year} (hrubé)',
  'taxes.card.withheldAbroad': 'sraženo v zahraničí {amount}',
  'taxes.card.interest': 'Úroky z hotovosti {year}',
  'taxes.card.section8': 'zdanitelné v §8',
  'taxes.card.exemptOverCap': 'nad stropem osvobození {amount}',

  'taxes.tax.title': 'Výpočet daně',
  'taxes.tax.hint':
    'Sazby 15 / 23 % podle §16a; základ se zaokrouhluje na celá sta dolů (§16). Zápočet zahraniční srážkové daně je prostý, počítá se per stát.',
  'taxes.tax.otherBases': 'Ostatní dílčí základy (Kč)',
  'taxes.tax.otherBasesHint':
    'Zaměstnání, podnikání, nájem — hranice pro 23 % sazbu je společná pro všechny §. Nula je přesná, pokud investice jsou jediný příjem.',
  'taxes.tax.section8': 'Základ §8 (dividendy + úroky)',
  'taxes.tax.section10': 'Základ §10 (zisk z prodejů)',
  'taxes.tax.otherBasesRow': 'Ostatní dílčí základy',
  'taxes.tax.totalBase': 'Základ celkem',
  'taxes.tax.roundedBase': 'Zaokrouhlený základ (§16)',
  'taxes.tax.baseRateTax': 'Daň 15 %',
  'taxes.tax.topRateTax': 'Daň 23 % nad {threshold}',
  'taxes.tax.taxBefore': 'Daň před zápočtem',
  'taxes.tax.credit': 'Zápočet zahraniční daně',
  'taxes.tax.taxAfter': 'Daň po zápočtu',
  'taxes.tax.residual': 'Nezapočtený zbytek',
  'taxes.tax.residualHint':
    'Nezapočtenou část lze podle §24 uplatnit jako výdaj v následujícím roce; appka ji nepřenáší.',

  'taxes.credit.title': 'Zápočet po státech',
  'taxes.credit.country': 'Stát',
  'taxes.credit.gross': 'Hrubý příjem',
  'taxes.credit.withheld': 'Sraženo',
  'taxes.credit.creditable': 'Započitatelné',
  'taxes.credit.maxCredit': 'Strop zápočtu',
  'taxes.credit.credit': 'Zápočet',
  'taxes.credit.residual': 'Zbytek',

  'taxes.sales.title': 'Prodeje {year}',
  'taxes.sales.hint': 'FIFO párování; kurzy ČNB ke dni transakce. Řádek = část prodeje z jednoho nákupu.',
  'taxes.sales.empty': 'V roce {year} žádné prodeje.',
  'taxes.sales.col.sold': 'Prodej',
  'taxes.sales.col.proceeds': 'Příjem',
  'taxes.sales.col.cost': 'Náklad',
  'taxes.sales.col.fee': 'Poplatky',
  'taxes.sales.col.gain': 'Zisk',
  'taxes.sales.col.timeTest': 'Časový test',
  'taxes.sales.col.taxable': 'Daní se',
  'taxes.sales.noLot': '⚠ bez známého nákupu',
  'taxes.sales.testMet': '✓ splněn',

  'taxes.dividends.title': 'Dividendy {year}',
  'taxes.dividends.empty': 'V roce {year} žádné dividendy.',
  'taxes.dividends.hint':
    'Hrubá částka jde do §8. Sražená daň se započítává do výše sazby podle smlouvy o zamezení dvojího zdanění.',
  'taxes.dividends.col.date': 'Datum',
  'taxes.dividends.col.country': 'Stát',
  'taxes.dividends.countryHint': 'Stát zdroje — přepiš, pokud ISIN neodpovídá (ADR, ETF). UNKNOWN = neznámý.',
  'taxes.dividends.col.type': 'Typ',
  'taxes.dividends.col.gross': 'Hrubá',
  'taxes.dividends.col.net': 'Čistá',
  'taxes.dividends.col.withheld': 'Sraženo',
  'taxes.dividends.col.effective': 'Sazba',
  'taxes.dividends.col.treaty': 'Smlouva',
  'taxes.dividends.col.creditable': 'Započitatelné',

  'taxes.lots.title': 'Časový test — otevřené nákupy',
  'taxes.lots.hint': 'Po 3 letech od nákupu je prodej osvobozen bez ohledu na částku (§4/1/x).',
  'taxes.lots.empty': 'Žádné otevřené nákupy — spusť sync na Portfoliu.',
  'taxes.lots.col.acquired': 'Nákup',
  'taxes.lots.col.exemptFrom': 'Osvobozeno od',
  'taxes.lots.col.countdown': 'Countdown',
  'taxes.lots.exempt': '✓ osvobozeno',
  'taxes.lots.days': '{days} dní',

  'taxes.transfer.title': 'Oprava díry — převod zbytku nákupů',
  'taxes.transfer.hint':
    'Corporate action (změna tickeru, spin-off): převede nespárované nákupy na nový ticker se zachovaným datem nabytí a cenou — časový test pokračuje. Chybějící drobný nákup (reinvest) doplň na Portfoliu formulářem s brokerem T212.',
  'taxes.transfer.from': 'Z tickeru',
  'taxes.transfer.to': 'Na ticker',
  'taxes.transfer.quantity': 'Množství (prázdné = celý zbytek)',
  'taxes.transfer.submit': 'Převést zbytek',
  'taxes.transfer.done': 'Převedeno {quantity} ks ({lots} lotů) — datum nabytí zachováno.',

  'taxes.disclaimer':
    'Orientační podklad pro přiznání, ne daňové poradenství. Přepočty denním kurzem ČNB; alternativou je jednotný kurz GFŘ vyhlašovaný po konci roku.',

  'warn.unmatchedSale':
    'Prodej {instrument} z {day}: chybí nákupy pro {quantity} ks (split nebo neúplná historie) — příjem započten, náklad 0, časový test nelze posoudit. Zkontroluj ručně.',
  'warn.currencyMismatch':
    '{instrument}: nákupy a prodeje mají různou měnu — zkontroluj data, náklad je přepočten měnou nákupu.',
  'warn.dividendGrossMissing': 'Dividenda {instrument} z {day}: chybí hrubá částka — počítám čistou, srážková daň 0.',
  'warn.withholdingNegative':
    'Dividenda {instrument} z {day}: čistá částka je o {amount} Kč vyšší než hrubá, sražená daň by vyšla záporně. Sráženou daň počítám jako 0 — zkontroluj údaje u brokera.',
  'warn.exemptOverCap':
    'Příjmy osvobozené časovým testem přesáhly strop {cap} Kč o {amount} Kč (§4 odst. 3). Přebytek je zdanitelný a které prodeje zdaníš, si vybíráš sám; do stropu se počítají i osvobozené příjmy mimo tuhle appku. Prober to s daňovým poradcem.',
  'warn.treatyExceeded':
    '{instrument} ({country}): sraženo {effective} %, smlouva o zamezení dvojího zdanění povoluje {treaty} %. Přebytek {excess} Kč není započitatelný — o jeho vrácení se žádá ve státě zdroje (u USA typicky chybí W-8BEN).',
  'warn.treatyUnknown':
    'Stát {country}: neznám sazbu podle smlouvy, zápočet proto není zastropovaný. Doplň stát u instrumentu nebo si sazbu ověř.',
  'warn.domesticDividend':
    '{instrument}: dividenda ze zdroje v ČR podléhá srážkové dani jako samostatný základ (§36), do §8 ani do zápočtu nepatří — do přiznání se neuvádí.',
  'warn.creditResidual':
    'Zápočet je zastropovaný poměrnou českou daní, {amount} Kč zahraniční daně se nezapočte. §24 dovoluje uplatnit tuto část jako výdaj v následujícím roce — appka nic nepřenáší.',
  'warn.otherBasesUsed': 'Do výpočtu vstupují ostatní dílčí základy {amount} Kč zadané ručně.',
  'warn.fxCurrencyUnquoted':
    'Měnu {currency} ČNB nekótuje — položky v této měně jsou z výpočtu vyřazeny a základ je neúplný. Přepočítej je ručně.',
  'warn.fxRateUnavailable':
    'Ke dni {day} se nepodařilo získat kurzovní lístek ČNB — položky z toho dne jsou vyřazeny a základ je neúplný.',
  'warn.itemDroppedNoRate': '{instrument}: chybí kurz alespoň pro jednu měnu položky, do výpočtu nevstupuje.',
  'warn.reconcile.split':
    '{instrument}: broker hlásí {broker} ks místo {history} — vypadá to na split v poměru {ratio}. Počet kusů srovnán podle brokera; pořizovací cena i datum nabytí zůstávají, časový test běží dál.',
  'warn.reconcile.adjusted':
    '{instrument}: broker hlásí {broker} ks, historie dává {history}. Počet srovnán podle brokera, celková pořizovací cena zůstala stejná.',
  'warn.reconcile.closed':
    '{instrument}: broker pozici nehlásí, historie nechávala {history} ks. Zavřeno podle brokera — zlomkové zbytky po doprodeji se přes API jinak nedozvíme.',
  'warn.reconcile.unexplained':
    '{instrument}: broker hlásí {broker} ks, ale v historii k nim není jediný nákup. Ty kusy nelze ocenit ani datovat — zkontroluj, jestli proběhlo stažení celé historie.',
} as const

export type MessageKey = keyof typeof cs
export type Dictionary = Readonly<Record<MessageKey, string>>
