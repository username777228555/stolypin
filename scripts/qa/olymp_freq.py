"""What olympiads ask again and again, and how much of it the course lessons teach. Input — plain text of tasks and keys
(`pdftotext -layout`, see olymp_gaps.py); one document = one olympiad and year: tasks, keys and tours of the same
paper are joined by file name (`147_2024_147-tasks-…`, `147_2024_147-ans-…` → `147_2024_147---…`).

Two tables:
1. base cards (people, events, terms, works) found in 3+ documents but linked from at most one lesson text;
2. recurring task themes (money, ranks, local government, WWII operations…): documents vs lessons that dwell on them.
People are matched by surname with case endings («Сперанского»), by «И. О. Фамилия», rulers by name and numeral;
shared or common surnames («Толстой», «Московский») only with a first name or initials; works only in «quotes».

  python3 scripts/qa/olymp_freq.py txt/*.txt
"""
import collections, glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def norm(s, quotes=False):
    s = (s or '').lower().replace('ё', 'е')
    if quotes: s = re.sub(r'["“”„]', '«', s)
    s = re.sub(r'-\n\s*', '', s)
    s = re.sub(r'[^a-zа-я0-9«»]+' if quotes else r'[^a-zа-я0-9]+', ' ', s)
    return ' ' + re.sub(r'\s+', ' ', s).strip() + ' '


docs = collections.defaultdict(str)
for path in sys.argv[1:]:
    docs[re.sub(r'anskrit|tasks|krit|ans|tur\d', '', os.path.basename(path).replace('.txt', ''))] += '\n' + open(path).read()
plain = {k: norm(v) for k, v in docs.items()}
quoted = {k: norm(v, True) for k, v in docs.items()}

ents, lessons = {}, []
for f in glob.glob(os.path.join(ROOT, 'content/packs/*/data/*.json')):
    d = json.load(open(f))
    for kind in ['persons', 'events', 'terms', 'culture']:
        for x in d.get(kind, []): ents[x['id']] = (kind, x)
    lessons += d.get('lessons', [])
linked = collections.defaultdict(set)
for l in lessons:
    for s in l.get('sections', []):
        for m in re.finditer(r'\[\[([a-z0-9-]+)', s.get('text', '')): linked[m.group(1)].add(l['id'])

ROMAN = {'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8}
STOP = set('и в на о об от с к по до из при за под для как год года годов гг г век века или его ее их не'.split())
PATRON = re.compile(r'(вич|вна|ична)$')


def infl(w):
    """A word with its case endings: surnames and nouns."""
    if w.endswith(('ский', 'цкий', 'ской', 'цкой', 'ый', 'ой', 'ий')) and len(w) > 4:
        return re.escape(w[:-2]) + '(?:ий|ой|ый|ого|ому|им|ом|ая|ую|ие|ые|их|ых|ими|ыми|ее|ей)'
    if w.endswith(('ов', 'ев', 'ин', 'ын')) and len(w) > 4: return re.escape(w) + '(?:|а|у|ым|ом|е|ы|ых|ой|ыми)'
    if w[-1] in 'ая' and len(w) > 3: return re.escape(w[:-1]) + '(?:а|я|ы|и|е|у|ю|ой|ей)'
    if w[-1] in 'ьй': return re.escape(w[:-1]) + '(?:ь|й|я|ю|ем|е|и|ей)'
    if w[-1] in 'иоуеэ': return re.escape(w)
    return re.escape(w) + '(?:|а|у|ом|ем|е|ы|и|ов|ам|ах)'


def loose(w):
    return re.escape(w if w.isdigit() or len(w) <= 4 else w[:-1] if len(w) <= 6 else w[:-2]) + r'\w{0,4}'


def ndocs(rx): return sum(1 for t in plain.values() if rx.search(t))


surnames = collections.Counter(norm(x.get('name')).split()[-1] for k, x in ents.values()
                               if k == 'persons' and len(norm(x.get('name')).split()) >= 3)


def person_patterns(x):
    name, short = norm(x.get('name')).split(), norm(x.get('short')).split()
    aliases = [norm(a).split() for a in (x.get('aliases') or []) if len(norm(a).split()) >= 2]
    if len(name) >= 2 and name[-1] in ROMAN:  # Пётр I, Пётр Великий
        return [r' %s (?:%s|%s)(?![ivx0-9])' % (infl(w[-2]), w[-1], ROMAN[w[-1]]) if w[-1] in ROMAN
                else ' ' + ' '.join(infl(t) for t in w[-2:]) + ' ' for w in [name, short] + aliases if len(w) >= 2]
    if len(name) >= 3 and PATRON.search(name[-2]):  # Имя Отчество Фамилия
        first, sur = name[0], name[-1]
        pats = [r' (?:%s|%s)(?: \w+)? %s ' % (infl(first), first[0], infl(sur)), r' %s (?:%s|%s)(?: \w)? ' % (infl(sur), infl(first), first[0])]
        alone = re.compile(r' %s ' % infl(sur))
        if surnames[sur] == 1 and len(sur) >= 5 and ndocs(alone) <= len(plain) // 3: pats.append(alone.pattern)
        return pats
    pats = []
    for w in [name, short] + aliases:
        if len(w) >= 2: pats.append(' ' + r' (?:\w+ ){0,1}'.join(infl(t) for t in w[-2:]) + ' ')
        elif len(w) == 1 and len(w[0]) >= 5 and ndocs(re.compile(r' %s ' % infl(w[0]))) <= len(plain) // 3: pats.append(r' %s ' % infl(w[0]))
    return pats


def title_patterns(t, quotes=False):
    w = [x for x in norm(t).split() if x not in STOP]
    if not w or any(len(x) < 3 and not x.isdigit() for x in w): return []
    if quotes: return [r'«(?:\w+ )?' + r' (?:\w+ ){0,1}'.join(loose(x) for x in w[:4])]
    if len(w) == 1: return [r' %s ' % infl(w[0])] if len(w[0]) >= 5 else []
    return [' ' + r' (?:\w+ ){0,2}'.join(loose(x) for x in w[:4]) + ' ']


rows = []
for eid, (kind, x) in ents.items():
    title = x.get('title') or x.get('term') or ''
    pats = person_patterns(x) if kind == 'persons' else title_patterns(title, kind == 'culture')
    if not pats: continue
    rx = re.compile('|'.join(pats))
    hit = [k for k, t in (quoted if kind == 'culture' else plain).items() if rx.search(t)]
    if len(hit) >= 3 and len(linked[eid]) <= 1:
        rows.append((len(hit), len(linked[eid]), eid, x.get('short') or x.get('name') or title))
print('== Карточки в 3+ олимпиадах (из %d), на которые ссылается не больше одного урока' % len(plain))
for n, l, eid, t in sorted(rows, reverse=True): print(f'{n:3}  уроков {l}  {eid:44} {t}')

THEMES = {
    'деньги, монеты, денежные реформы': r' (?:рубл|копе[ей]|алтын|деньг|денег|червон|ассигнац|монет\w*|денежн\w* реформ)',
    'старинные меры': r' (?:верст|сажен|аршин|вершк|вершок|пуд|золотник|берковц)',
    'летоисчисление и датировка': r' (?:сотворени\w* мира|летоисчислен|юлианск|григорианск|по старому стилю|римск\w* цифр|кирилли\w* цифр)',
    'гербы и почётные звания городов': r' (?:герб\w* (?:город|губерн)|город\w* геро|воинской славы|трудовой доблести|золото\w* кольц)',
    'чины, звания, должности': r' (?:табел\w* о ранг|титулярн|коллежск\w* (?:асессор|регистратор|советник)|окольнич|стольник|стряпч|думн\w* (?:дворян|дьяк)|жильц)',
    'приказы XVI–XVII веков': r' (?:посольск\w* приказ|разрядн\w* приказ|поместн\w* приказ|приказ тайных дел|сибирск\w* приказ|стрелецк\w* приказ|холоп\w* приказ)',
    'местное управление и самоуправление': r' (?:губернск\w* реформ|учреждени\w* для управлени|городов\w* положени|земск\w* учрежден|земск\w* реформ|городск\w* дум|исправник|наместничеств)',
    'конституции и высшие органы власти': r' (?:конституци\w* (?:рсфср|ссср|российской федерации|1918|1924|1936|1937|1977|1978|1993)|верховн\w* совет|съезд\w* (?:советов|народных депутатов))',
    'операции Великой Отечественной': r' (?:наступательн\w* операци|операци\w* (?:багратион|уран|кольцо|искра|январский))',
    'мирные договоры': r' (?:мирн\w* договор|\w+ск\w* мир |\w+ское перемирие|трактат)',
    'советское кино': r' (?:кинофильм|фильм\w*|кинорежисс)',
    'плакаты и карикатуры': r' (?:плакат|карикатур|крокодил|кукрыникс)',
    'ордена и медали': r' (?:орден\w* (?:святого|ленина|победы|славы|красн|александра|андрея|георгия|владимира|анны)|медал\w*)',
    'историки и историография': r' (?:ключевск|соловьев\w* с|карамзин|татищев|скрынников|костомаров)',
}
lesson_text = [(l['title'], norm(' '.join(s.get('title', '') + ' ' + re.sub(r'\[\[[^|\]]+\|?', '', s.get('text', '')) for s in l.get('sections', []))))
               for l in lessons]
print('\n== Темы заданий: олимпиад, уроков с упоминанием, уроков, где тема раскрыта (3+ упоминания)')
for theme, rx in sorted(THEMES.items(), key=lambda kv: -ndocs(re.compile(kv[1]))):
    r = re.compile(rx)
    strong = sorted(((len(r.findall(t)), title) for title, t in lesson_text if len(r.findall(t)) >= 3), reverse=True)
    print(f'{ndocs(r):3} {sum(1 for _, t in lesson_text if r.search(t)):4} {len(strong):3}  {theme}   ' + '; '.join(t for _, t in strong[:3]))
