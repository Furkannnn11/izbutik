import SwiftUI

/// Güvenli giriş ekranı.
///
/// - Ayarlanabilir **backend URL** alanı (koda gömülü değil; Debug'da varsayılan
///   loopback ön-dolu, Release'te boş → kullanıcı HTTPS girer).
/// - E-posta (`admin@izbutik.local` koda gömülü **değil**, kullanıcı yazar) + parola.
/// - Yükleniyor / hata / offline durumları, tümü Türkçe.
/// - Parola alanı `SecureField`; parola hiçbir yere yazılmaz (yalnız login gövdesi).
struct LoginView: View {
    @EnvironmentObject private var session: SessionManager

    @State private var email: String = ""
    @State private var password: String = ""
    @State private var isSubmitting: Bool = false
    @FocusState private var focusedField: Field?

    private enum Field { case url, email, password }

    var body: some View {
        ZStack {
            BrandColor.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: BrandSpacing.lg) {
                    header

                    field(
                        title: "Sunucu adresi (backend URL)",
                        systemImage: "server.rack"
                    ) {
                        TextField("https://magaza.izbutik.com", text: $session.backendURL)
                            .textContentType(.URL)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focusedField, equals: .url)
                            .submitLabel(.next)
                            .onSubmit { focusedField = .email }
                    }
                    Text(AppEnvironment.backendURLRequirementText)
                        .font(BrandTypography.footnote)
                        .foregroundStyle(BrandColor.textSecondary)

                    field(title: "E-posta", systemImage: "envelope") {
                        TextField("admin@izbutik.local", text: $email)
                            .textContentType(.username)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focusedField, equals: .email)
                            .submitLabel(.next)
                            .onSubmit { focusedField = .password }
                    }

                    field(title: "Parola", systemImage: "lock") {
                        SecureField("Parolanız", text: $password)
                            .textContentType(.password)
                            .focused($focusedField, equals: .password)
                            .submitLabel(.go)
                            .onSubmit { submit() }
                    }

                    if let message = session.errorMessage {
                        errorBanner(message)
                    }

                    BrandPrimaryButton("Giriş yap",
                                       systemImage: "arrow.right.circle",
                                       isLoading: isSubmitting) {
                        submit()
                    }
                    .disabled(isSubmitting)

                    Text("Kimlik bilgileriniz cihazınızda güvenle saklanır; parolanız hiçbir yerde tutulmaz.")
                        .font(BrandTypography.caption)
                        .foregroundStyle(BrandColor.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, BrandSpacing.sm)
                }
                .padding(BrandSpacing.xl)
            }
            .scrollDismissesKeyboard(.interactively)
        }
    }

    // MARK: - Alt görünümler

    private var header: some View {
        VStack(alignment: .leading, spacing: BrandSpacing.xs) {
            Text("İzbutik Admin")
                .font(BrandTypography.largeTitle)
                .foregroundStyle(BrandColor.textPrimary)
            Text("Butik mağazanızı iPhone'dan güvenle yönetin.")
                .font(BrandTypography.subheadline)
                .foregroundStyle(BrandColor.textSecondary)
        }
        .padding(.bottom, BrandSpacing.sm)
        .accessibilityElement(children: .combine)
    }

    private func field<Content: View>(title: String,
                                      systemImage: String,
                                      @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: BrandSpacing.xxs) {
            Label(title, systemImage: systemImage)
                .font(BrandTypography.footnote.weight(.semibold))
                .foregroundStyle(BrandColor.textSecondary)
            content()
                .font(BrandTypography.body)
                .foregroundStyle(BrandColor.textPrimary)
                .padding(BrandSpacing.md)
                .frame(minHeight: BrandLayout.minTouchTarget)
                .background(BrandColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: BrandLayout.cornerRadius))
                .overlay(
                    RoundedRectangle(cornerRadius: BrandLayout.cornerRadius)
                        .stroke(BrandColor.separator, lineWidth: 1)
                )
        }
        .accessibilityElement(children: .contain)
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: BrandSpacing.sm) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.white)
            Text(message)
                .font(BrandTypography.footnote)
                .foregroundStyle(.white)
        }
        .padding(BrandSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BrandColor.danger)
        .clipShape(RoundedRectangle(cornerRadius: BrandLayout.cornerRadius))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text("Hata: \(message)"))
    }

    // MARK: - Eylem

    private func submit() {
        guard !isSubmitting else { return }
        focusedField = nil
        isSubmitting = true
        Task {
            defer { isSubmitting = false }
            // Hatalar SessionManager.errorMessage üzerinden yüzeye çıkar.
            try? await session.login(email: email, password: password)
        }
    }
}
