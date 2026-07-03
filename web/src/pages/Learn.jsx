import React, { useState } from 'react';
import { PageHeader } from '../components/ui';

// Curated, canonical resources per track. Free resources link to the official
// source; books link to Goodreads (buy/borrow anywhere).
const TRACKS = {
  Investing: {
    icon: '💰',
    path: 'Start with Buffett\'s letters and Zerodha Varsity, then Graham for the mental framework, Damodaran when you\'re ready to value businesses yourself.',
    items: [
      { title: 'Berkshire Hathaway Shareholder Letters', source: 'Warren Buffett', type: 'Free letters', level: 'All levels', link: 'https://www.berkshirehathaway.com/letters/letters.html', desc: 'Fifty years of the clearest thinking on business, moats and market temperament ever written. The single best free resource in investing.' },
      { title: 'Varsity — Fundamental Analysis', source: 'Zerodha', type: 'Free course', level: 'Beginner', link: 'https://zerodha.com/varsity/module/fundamental-analysis/', desc: 'India-focused, plain-English walk through reading annual reports, ratios and building an intrinsic-value habit.' },
      { title: 'The Intelligent Investor', source: 'Benjamin Graham', type: 'Book', level: 'Beginner', link: 'https://www.goodreads.com/book/show/106835.The_Intelligent_Investor', desc: 'The value-investing bible. Chapters 8 (Mr. Market) and 20 (Margin of Safety) are the two most important chapters in the canon.' },
      { title: 'Valuation & Corporate Finance Courses', source: 'Aswath Damodaran (NYU)', type: 'Free course', level: 'Intermediate', link: 'https://www.youtube.com/@AswathDamodaranonValuation', desc: 'The "Dean of Valuation" posts his entire NYU MBA courses free: DCF, relative valuation, story-to-numbers. World-class, zero cost.' },
      { title: 'Memos from Howard Marks', source: 'Oaktree Capital', type: 'Free memos', level: 'Intermediate', link: 'https://www.oaktreecapital.com/insights/memos', desc: 'Market cycles, risk and second-level thinking. Buffett says when a Marks memo arrives, he reads it first.' },
      { title: 'Poor Charlie\'s Almanack', source: 'Charlie Munger', type: 'Free book (online)', level: 'Intermediate', link: 'https://www.stripe.press/poor-charlies-almanack', desc: 'Munger\'s mental models and worldly wisdom — the full book is published free online by Stripe Press.' },
      { title: 'Common Stocks and Uncommon Profits', source: 'Philip Fisher', type: 'Book', level: 'Intermediate', link: 'https://www.goodreads.com/book/show/79403.Common_Stocks_and_Uncommon_Profits', desc: 'The growth-investing classic: scuttlebutt research and the fifteen points to look for in a business.' },
      { title: 'The Little Book That Beats the Market', source: 'Joel Greenblatt', type: 'Book', level: 'Beginner', link: 'https://www.goodreads.com/book/show/1002.The_Little_Book_That_Beats_the_Market', desc: 'The Magic Formula — quality (return on capital) plus value (earnings yield) — explained so simply a kid can run it. Powers our Greenblatt guru screen.' },
    ],
  },
  Trading: {
    icon: '📈',
    path: 'Read Minervini for the system, O\'Neil for the pattern language, Douglas for the psychology — then Market Wizards to see how the greats differ.',
    items: [
      { title: 'Trade Like a Stock Market Wizard', source: 'Mark Minervini', type: 'Book', level: 'Intermediate', link: 'https://www.goodreads.com/book/show/16189528-trade-like-a-stock-market-wizard', desc: 'SEPA methodology: stage-2 uptrends, volatility contraction and precise risk. The framework behind our Druck & Minervini tab and guru screen.' },
      { title: 'How to Make Money in Stocks', source: 'William O\'Neil', type: 'Book', level: 'Beginner', link: 'https://www.goodreads.com/book/show/57666.How_to_Make_Money_in_Stocks', desc: 'CANSLIM: growth + momentum + institutional sponsorship, with a hundred annotated historical charts.' },
      { title: 'Trading in the Zone', source: 'Mark Douglas', type: 'Book', level: 'All levels', link: 'https://www.goodreads.com/book/show/868375.Trading_in_the_Zone', desc: 'The psychology book. Probabilistic thinking, why edges only pay over series of trades, and how to actually take your stops.' },
      { title: 'Market Wizards series', source: 'Jack Schwager', type: 'Book', level: 'All levels', link: 'https://www.goodreads.com/book/show/966769.Market_Wizards', desc: 'Interviews with the best traders of a generation. The recurring lesson: risk management is the common denominator.' },
      { title: 'Varsity — Technical Analysis', source: 'Zerodha', type: 'Free course', level: 'Beginner', link: 'https://zerodha.com/varsity/module/technical-analysis/', desc: 'Candlesticks, support/resistance, moving averages and volume — clean, free and India-focused.' },
      { title: 'The Art & Science of Trading (free course)', source: 'Adam Grimes', type: 'Free course', level: 'Intermediate', link: 'https://adamhgrimes.com/the-art-and-science-of-trading/course/', desc: 'A complete, genuinely free trading course from a quant-minded discretionary trader — statistics of edges included.' },
      { title: 'Reminiscences of a Stock Operator', source: 'Edwin Lefèvre', type: 'Book', level: 'All levels', link: 'https://www.goodreads.com/book/show/100779.Reminiscences_of_a_Stock_Operator', desc: 'Jesse Livermore\'s story, 1923. A century old and still the most quoted trading book there is.' },
    ],
  },
  Options: {
    icon: '⛓️',
    path: 'Varsity\'s two options modules first (free), then Natenberg for volatility, McMillan as the desk reference. OIC for mechanics whenever confused.',
    items: [
      { title: 'Varsity — Options Theory for Professionals', source: 'Zerodha', type: 'Free course', level: 'Beginner', link: 'https://zerodha.com/varsity/module/option-theory/', desc: 'Calls, puts, moneyness, the Greeks — the best free starting point, with NIFTY examples matching our Option Chain tab.' },
      { title: 'Varsity — Option Strategies', source: 'Zerodha', type: 'Free course', level: 'Intermediate', link: 'https://zerodha.com/varsity/module/option-strategies/', desc: 'Spreads, straddles, condors and when each structure fits — the follow-up module.' },
      { title: 'Option Volatility and Pricing', source: 'Sheldon Natenberg', type: 'Book', level: 'Intermediate', link: 'https://www.goodreads.com/book/show/239158.Option_Volatility_Pricing', desc: 'The professional standard on volatility, the Greeks and risk. If you only buy one options book, buy this one.' },
      { title: 'Options as a Strategic Investment', source: 'Lawrence McMillan', type: 'Book', level: 'Advanced', link: 'https://www.goodreads.com/book/show/104555.Options_as_a_Strategic_Investment', desc: 'The thousand-page desk reference covering essentially every strategy and its management.' },
      { title: 'Options Industry Council (OIC) Education', source: 'optionseducation.org', type: 'Free course', level: 'All levels', link: 'https://www.optionseducation.org/', desc: 'The US industry body\'s free curriculum — mechanics, exercise/assignment, Greeks calculators, strategy explainers.' },
      { title: 'Cboe Options Institute', source: 'Cboe', type: 'Free course', level: 'All levels', link: 'https://www.cboe.com/education/', desc: 'Education from the exchange that invented listed options — courses, webinars and the VIX explained by its home.' },
      { title: 'tastylive Options Education', source: 'tastylive', type: 'Free videos', level: 'Intermediate', link: 'https://www.tastylive.com/concepts-strategies', desc: 'Premium-selling school of thought: probabilities, IV rank, defined-risk structures — useful counterweight to buying-only thinking.' },
    ],
  },
};

const LEVEL_COLORS = {
  'Beginner': 'var(--green-gain)',
  'Intermediate': 'var(--primary-gold)',
  'Advanced': 'var(--red-loss)',
  'All levels': 'var(--primary-accent)',
};

const Learn = () => {
  const [track, setTrack] = useState('Investing');
  const active = TRACKS[track];

  return (
    <div className="fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <PageHeader
        code="LEARN"
        title="Learn"
        subtitle="A curated shelf of world-class material — canonical books, and courses that are genuinely free from the original source."
      />

      <div style={{ display: 'flex', gap: '10px', margin: '18px 0', flexWrap: 'wrap' }}>
        {Object.entries(TRACKS).map(([name, t]) => (
          <button
            key={name}
            onClick={() => setTrack(name)}
            className={track === name ? '' : 'secondary'}
            style={{ width: 'auto', padding: '10px 22px', borderRadius: '20px' }}
          >
            {t.icon} {name}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: '14px 18px', marginBottom: '18px', fontSize: '13px', color: 'var(--text-secondary)', borderLeft: '3px solid var(--primary-accent)' }}>
        <strong style={{ color: 'var(--primary-accent)' }}>Suggested path:</strong> {active.path}
      </div>

      {active.items.map((item, i) => (
        <a
          key={i}
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="card"
          style={{ display: 'block', padding: '16px 20px', marginBottom: '12px', textDecoration: 'none', color: 'inherit' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700, fontSize: '15px' }}>
              {item.title}
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '13px' }}> — {item.source}</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 10px', borderRadius: '10px', background: item.type.startsWith('Free') ? 'rgba(50,215,75,0.12)' : 'rgba(255,255,255,0.06)', color: item.type.startsWith('Free') ? 'var(--green-gain)' : 'var(--text-secondary)', border: '1px solid currentColor' }}>
                {item.type}
              </span>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 10px', borderRadius: '10px', border: '1px solid currentColor', color: LEVEL_COLORS[item.level] }}>
                {item.level}
              </span>
            </div>
          </div>
          <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{item.desc}</p>
        </a>
      ))}

      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Links go to official/free sources or Goodreads for books — Alpha Nova has no affiliation with any of them. Educational material, not investment advice.
      </p>
    </div>
  );
};

export default Learn;
