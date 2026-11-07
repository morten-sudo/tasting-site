# Runs make_strings.py against the local src/i18n instead of GitHub main. Usage: python3 ios/tools/make_strings_local.py <repo root>
import sys, urllib.request, io, os
root = sys.argv[1]
class R:
    def __init__(s, p): s.p = p
    def read(s): return open(s.p, 'rb').read()
def fake(url):
    lang = url.rsplit('/', 1)[1]
    return R(os.path.join(root, 'src/i18n', lang))
urllib.request.urlopen = fake
exec(open(os.path.join(root, 'ios/tools/make_strings.py')).read())
