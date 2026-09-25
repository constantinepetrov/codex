import sys, fitz
for n in sys.argv[1:]:
    d = fitz.open(n + '.pdf'); print(n, 'pages:', len(d), 'links:', [l.get('uri') for l in d[0].get_links()],
          'fonts:', {f[3] for f in d[0].get_fonts()})
    d[0].get_pixmap(dpi=110).save(n + '.png')
