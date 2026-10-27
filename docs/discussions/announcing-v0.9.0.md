---
version: 0.9.0
permalink: /discussions/announcing-v0.9.0
layout: default
title: "Announcing gistory v0.9.0"
comments: false
nav_order: 21
---

# gistory 0.9.0

gistory is a personal prompt manager that runs in your browser with no
account. Write prompts with variable placeholders, copy them filled in,
organize with tags and projects, and sync across devices end to end
encrypted. v0.9.0 is the first release line, and it ships the sync engine
as its own installable package alongside the app:

```npm
npm i gistory-sync
```

The app runs at [gistory.creadev.org](https://gistory.creadev.org/) with no
install at allqÜ» the package is for developers who want the same encrypted
push/pull engine outside the browser. Repo links at the end.

## What the package ships

MeZ¸­x‹ÛÛ\]HÛÚÈ	:Ûˆ[›İ\ˆÛˆ\È[™B‚˜˜]˜\ØÜš\š[\ÜÈŞ[˜ĞYÙ[Y\™ÙT^[ØYŞ[˜Ô[ÜÈHœ›ÛH	ÙÚ\İÜK\Ş[˜ÉÂ‚˜‚•H™XXİ\[™HŞ[˜È™[^Hİ^H\ÈÙˆH[Û›Ü™\Ë›İBœXÚØYÙKˆ^H\ŞH\ÈÛ™HÛİY›\™HYÙ\È›Ú™Xİ‚‚ˆÈÈÚ]K›ÛZ\Ù\Â‚”Ş[˜ÙY^[ØYÈÙY\ÛÛÜY\ÈY\™ÙXX›KˆšY[ÈYYY\ˆH™[X\ÙB˜\™HÜ[Û˜[[™Y\™ÙHÛÈ]]šXÙ\È[›š[™ÈY™™\™[XÚØYÙH™\œÚ[ÛœÂ˜ÛÛ™\™ÙH[ˆÛ™HÚZ[‹ˆY\™Ù\ÈZÙHH™]Ù\ˆ[Y\İ[\[]\ÈšYH\ÂÛXœİÛ™\Ë[™Ü[Û˜[Y][ÛœÈ™]™\ˆÚ[™ÙHİÈ[ˆ^\İ[™ÈšY[œ™\ÛÛ™\Ë‚‚•HœH™[X\ÙH\[[™H[œÈÛˆ™\œÚ[ÛˆYÜÈÛ›K›İYÚœH\İY”X›\Ú[™ÎˆH™YÚ\İH™\šYšY\ÈHÛÜšÙ›İÉÜÈY[]HYØZ[œİB•\İYX›\Ú\ˆ[KÛÈ›ÈÚÙ[ˆ\ÈİÜ™Y[]Ú\™KˆK\ÈB›X[X[›Ûİİ˜\Y\ÈYËYš]™[ˆX›\Ú[™ÈZÙ\Èİ™\ˆœ›ÛHKŒŒ‚‚ˆÈÈİÈŞ[˜ÈÛÜšÜÂ‚•H[˜Ü\[ÛˆÙ^H\š]™\ÈÛˆ[İ\ˆ]šXÙHœ›ÛH[İ\ˆ\ÜÜ˜\ÙH[™B˜ÚZ[ˆYˆH\ÜÜ˜\ÙH™]™\ˆX]™\ÈH]šXÙKˆH™[^HİÜ™\Â˜Ú\\^]Ø[››İ™XYÙ\]Y[˜Ù\È][™[™Èİ]Y™œÎÈ]™]™\‚šÛÈ[][™È\š]™Yœ›ÛH[İ\ˆ\ÜÜ˜\ÙK[™Üš][™ÈÈHÚZ[‚˜Y][Û˜[H™\]Z\™\ÈHÜš]HÙXÜ™]H™[^HÛ›H]™\ˆÙY\È\ÈXXÚ[YHÙXÜ™]H™[^HÛ›H]™\ˆÙY\È\ÈH\Úˆ[]\ÈY\™ÙHZÙHY]Ë‚‚ˆÈÈÚ\™HÈİ\‚•HÙÙ][™Èİ\YİZYWJÙÚ\İÜKÙÙ][™Ë\İ\Y
HÛİ™\œÈH\[ˆ[‚›Z[]\ÎÈHÛœHİZYWJÙÚ\İÜKÛœJHÛİ™\œÈHXÚØYÙKˆH™\ÈÚ]B™[[˜›ÛÚÈ\ÈÙ]\[‹ÙÚ\İÜWJÎ‹ËÙÚ]X‹˜ÛÛKÙ]\[‹ÙÚ\İÜJK‚