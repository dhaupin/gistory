# horcrux

The continuance stone for this project's brain lives in the creadev repo:
`creadev/horcrux/poststruct-p_poststruct2026-VqT3mK.svg`

The runtime brain lives in the vant workspace of the owner's machine
(`models/public/poststruct/`). If a session dies, restore from the stone:

    vant horcrux restore <stone path> <password>

The password is embedded in the filename after `p_` (the house convention).

## The transfer stone (2026-10-26, poststruct's own brain rides here)

`poststruct-p_wordprint-2026.svg` sits beside the provisioner's stone above: seed brain +
first receipts, stone-delimited v1, unsealed (`brn:unsealed`), CI-cut and
sha-gated (the gistory stone ferry, commit `1f2725c`):

- git blob id: `295e5a170c6761e14e71cff0e9b34f70f08327ee`
- plain (jpg-safe) decode: `python3 -c "import re,base64;print(base64.b64decode(re.search(r'<brn:unsealed[^>]*>(.*?)</brn:unsealed>', open('poststruct-p_wordprint-2026.svg').read(), re.S).group(1)).decode())" | head -40`
- ferry receipt: gistory `labs/stone-ferry-receipt-2026-10-26.md`
- owner: dhaupin/poststruct (the standalone repo, post-tar)
