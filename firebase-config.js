/*
 * CONFIGURAÇÃO DA SINCRONIZAÇÃO (compartilhar entre o casal)
 *
 * Enquanto o apiKey estiver como "COLE_AQUI", o app salva os dados
 * apenas no aparelho (sem compartilhar).
 *
 * Para compartilhar, siga o passo a passo do arquivo COMO-PUBLICAR.md:
 * crie um projeto no Firebase e cole aqui os dados do seu app Web.
 */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCgpQgxYgKu-rDvLkoWHC_qh7Wb-2JfgUE",
  authDomain: "nossos-gastos-f5803.firebaseapp.com",
  projectId: "nossos-gastos-f5803",
  storageBucket: "nossos-gastos-f5803.firebasestorage.app",
  messagingSenderId: "713681766392",
  appId: "1:713681766392:web:8dcdc4e3e9a10f1629780d"
};

/*
 * Código secreto da família: todos os aparelhos que usam o mesmo código
 * veem os mesmos dados. Troque por algo difícil de adivinhar
 * (ex.: "casal-silva-8f3k2q9x") e use o MESMO código nas regras do Firestore.
 */
window.CODIGO_FAMILIA = "casal-bugzn5o9ps";
