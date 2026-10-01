# İzbutik Admin — Native iOS Yönetim Uygulaması (İskelet)

Görev: TASK_3314f4a3 / Adım 4 — Native iOS proje iskeleti
Platform: **SwiftUI**, iOS **17+**, Swift **5.10** (araç zinciri Swift 6.2.1)

## Modüler yapı

```
IzbutikAdmin/
├── IzbutikAdmin.xcodeproj         # objectVersion 77, synchronized groups
├── Config/                         # xcconfig (Debug/Release ayrımı)
│   ├── Base.xcconfig
│   ├── Debug.xcconfig              # ATS_ALLOWS_LOCAL = YES (loopback http)
│   └── Release.xcconfig            # ATS_ALLOWS_LOCAL = NO  (yalnız https)
├── IzbutikAdmin/
│   ├── App/                        # @main + kök yönlendirme
│   │   ├── IzbutikAdminApp.swift
│   │   └── RootView.swift          # loading / loggedOut / loggedIn + sekmeler
│   ├── Core/                       # ortam, güvenlik, biçimlendirme
│   │   ├── AppEnvironment.swift    # Debug=127.0.0.1:9000, Release=HTTPS zorunlu
│   │   ├── KeychainStore.swift     # JWT/parola YALNIZ Keychain
│   │   └── PriceFormatter.swift    # major-unit ondalık → "749,90 ₺"
│   ├── API/                        # Medusa v2 istemcisi + modeller
│   │   ├── Models.swift            # gözlenen JSON şemalarına Codable
│   │   └── MedusaAPIClient.swift   # URLSession + async/await, JWT Bearer
│   ├── Auth/
│   │   └── SessionManager.swift    # oturum durum makinesi
│   ├── Features/                   # Dashboard / Products / Orders (iskelet)
│   ├── DesignSystem/               # scheme-aware token + bileşenler
│   │   ├── BrandColor.swift        # açık/koyu çift, kontrast testli
│   │   ├── BrandTypography.swift   # Dynamic Type + boşluk/yerleşim (44pt)
│   │   └── BrandComponents.swift   # birincil buton, durum rozeti (VoiceOver)
│   └── Resources/
│       ├── Info.plist              # NSAllowsLocalNetworking=$(ATS_ALLOWS_LOCAL)
│       └── Assets.xcassets         # AppIcon + AccentColor (scheme-aware)
└── IzbutikAdminTests/              # hedefli unit testler
    ├── BrandContrastTests.swift    # WCAG: normal ≥4.5:1, grafik ≥3:1
    ├── PriceFormatterTests.swift   # major-unit (×100 YOK)
    ├── BackendURLValidationTests.swift
    └── ModelDecodingTests.swift    # gözlenen fixture'lara decode
```

## Erişilebilirlik / marka temeli (Adım 4 kapsamı)

- **Açık/koyu tema**: her renk `UIColor(dynamicProvider:)` ile açık/koyu çifti
  taşır; sabit açık renk + semantik metin karışımı yok.
- **Kontrast (doğrulandı, `BrandContrastTests`):** açık birincil 16.3:1, açık
  ikincil 5.7:1, buton 10.6:1; koyu birincil 16.7:1, koyu ikincil 8.9:1, aksan
  grafiği 4.7:1 — hepsi eşiğin üstünde.
- **Dynamic Type**: sabit punto yerine `Font.TextStyle` tabanlı tipografi.
- **VoiceOver**: bileşenlerde `accessibilityLabel` / trait / hint.
- **Dokunma alanı**: birincil buton `minHeight 44`.

## Backend URL / ATS kuralı

- **Debug**: varsayılan `http://127.0.0.1:9000`; ATS localhost istisnası açık.
- **Release**: koda gömülü varsayılan YOK; kullanıcı **HTTPS** URL girer; ATS
  localhost istisnası **kapalı**. `admin@izbutik.local` koda gömülmez.

## Güvenlik

- JWT ve parola yalnız Keychain'de; kaynak/log/UserDefaults/fixture'da secret yok.
- Fixture JSON'ları gözlenen ŞEMA örneğidir; gerçek kimlik/token içermez.

## Doğrulama (bu adımda çalıştırıldı)

- `xcodebuild build -scheme IzbutikAdmin -sdk iphonesimulator` (Debug) → **BUILD SUCCEEDED**
- Aynı, `-configuration Release` → **BUILD SUCCEEDED**
- Debug Info.plist `NSAllowsLocalNetworking=YES`, Release `=NO` (plutil ile teyit).
- `swiftc -parse` DEĞİL; gerçek cross-file derleme ile doğrulandı.

## Proje üretimi

`.xcodeproj` `gen_pbxproj.py` ile üretildi (synchronized root groups,
objectVersion 77). Dosya ekleme/çıkarma sonrası yeniden çalıştırılabilir.

> Sonraki adımlar: giriş ekranı (Adım 5), dashboard/ürünler/stok (Adım 6),
> siparişler (Adım 7), test+güvenlik (Adım 8), gerçek smoke (Adım 9).
