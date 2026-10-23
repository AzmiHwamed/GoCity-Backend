import { LegalType } from './entities/legal-document.entity';

export type LegalLanguage = 'en' | 'fr' | 'ar';

const french = {
  [LegalType.PRIVACY_POLICY]: { title: 'Politique de confidentialité', content: `> **Modèle :** Ce document doit être revu par un professionnel du droit avant sa mise en service.

GoCity (« nous ») explique ici les données personnelles collectées lorsque vous utilisez le site et les applications, les raisons de leur utilisation et vos choix. Contact : [Contact email].

## 1. Données collectées
Nous traitons les données de compte (nom, e-mail, mot de passe chiffré), votre profil, vos voyages, invitations, favoris, notifications, recherches de lieux et contenus que vous ajoutez. Les membres d’un voyage peuvent voir son contenu.

## 2. Utilisation des données
Nous les utilisons pour fournir et sécuriser le service, organiser les voyages, envoyer les e-mails et notifications demandés, prévenir les abus et respecter nos obligations légales. Nous ne vendons pas vos données et n’utilisons pas de traceurs publicitaires.

## 3. Partage et conservation
Les voyages sont privés par défaut. Un voyage partagé par lien ou public peut être vu et copié selon vos réglages. Nous utilisons des prestataires d’hébergement, d’e-mail, Google Places et Firebase. Les données sont conservées pendant la durée nécessaire au service ou aux obligations légales.

## 4. Vos droits et sécurité
Selon votre pays, vous pouvez demander l’accès, la correction, la suppression, l’exportation ou la limitation du traitement. Les mots de passe sont hachés et les accès sont contrôlés. Contactez [Contact email] pour exercer vos droits.

## 5. Modifications et contact
Nous publions une nouvelle version et vous demandons de la consulter en cas de changement important. [Company name], [Company address], [Contact email].` },
  [LegalType.TERMS_OF_USE]: { title: 'Conditions d’utilisation', content: `> **Modèle :** Ce document doit être revu par un professionnel du droit avant sa mise en service.

Ces conditions régissent votre utilisation de GoCity. En créant un compte ou en utilisant GoCity, vous les acceptez ainsi que la [Politique de confidentialité](/privacy).

## 1. Le service
GoCity aide à planifier des voyages, itinéraires, activités, budgets, dépenses et contenus partagés. GoCity ne vend pas de voyages et ne réalise pas de réservations.

## 2. Votre compte et votre contenu
Vous devez fournir des informations exactes, protéger votre compte et avoir l’âge requis. Vous conservez vos contenus, mais nous accordez la licence nécessaire pour les héberger et les afficher pour le service et les personnes avec qui vous les partagez.

## 3. Utilisation acceptable
N’enfreignez pas la loi ou les droits d’autrui, ne publiez pas de contenu nuisible, ne spammez pas, ne contournez pas la sécurité et n’accédez pas aux données sans autorisation. Nous pouvons retirer du contenu ou limiter un compte.

## 4. Responsabilité et modifications
Les informations de tiers peuvent varier ; vérifiez les horaires, prix, conditions et réservations. Le service est fourni « tel quel » dans les limites de la loi. Nous pouvons mettre à jour ces conditions et vous demander de les accepter. Contact : [Contact email].` },
};

const arabic = {
  [LegalType.PRIVACY_POLICY]: { title: 'سياسة الخصوصية', content: `> **نموذج:** يجب مراجعة هذه الوثيقة من مختص قانوني قبل الإطلاق.

توضح GoCity («نحن») البيانات الشخصية التي نجمعها عند استخدام الموقع والتطبيقات، وأسباب استخدامها وخياراتك. للتواصل: [Contact email].

## 1. البيانات التي نجمعها
نعالج بيانات الحساب والملف الشخصي والرحلات والدعوات والمفضلة والإشعارات وعمليات البحث والمحتوى الذي تضيفه. يمكن لأعضاء الرحلة رؤية محتواها.

## 2. كيفية استخدام البيانات
نستخدم البيانات لتقديم الخدمة وتأمينها، وتنظيم الرحلات، وإرسال الرسائل والإشعارات المطلوبة، ومنع إساءة الاستخدام والالتزام بالقانون. لا نبيع بياناتك ولا نستخدم متتبعات إعلانية.

## 3. المشاركة والاحتفاظ
الرحلات خاصة افتراضياً. يمكن مشاهدة الرحلة التي تشاركها برابط أو تجعلها عامة ونسخها وفق إعداداتك. نستخدم مزودي الاستضافة والبريد وGoogle Places وFirebase. نحتفظ بالبيانات للمدة اللازمة للخدمة أو الالتزامات القانونية.

## 4. حقوقك وأمانك
بحسب بلدك، يمكنك طلب الوصول إلى بياناتك أو تصحيحها أو حذفها أو تصديرها أو تقييد معالجتها. كلمات المرور مجزأة ويتم التحكم في الوصول. تواصل مع [Contact email] لممارسة حقوقك.

## 5. التغييرات والتواصل
ننشر نسخة جديدة ونطلب مراجعتها عند التغييرات المهمة. [Company name]، [Company address]، [Contact email].` },
  [LegalType.TERMS_OF_USE]: { title: 'شروط الاستخدام', content: `> **نموذج:** يجب مراجعة هذه الوثيقة من مختص قانوني قبل الإطلاق.

تحكم هذه الشروط استخدامك لـ GoCity. بإنشاء حساب أو استخدام GoCity فإنك توافق عليها وعلى [سياسة الخصوصية](/privacy).

## 1. الخدمة
تساعدك GoCity في تخطيط الرحلات والمسارات والأنشطة والميزانيات والمصروفات والمحتوى المشترك. لا تبيع GoCity الرحلات ولا تنفذ الحجوزات.

## 2. حسابك ومحتواك
يجب تقديم معلومات دقيقة وحماية حسابك واستيفاء السن المطلوب. تحتفظ بملكية محتواك، وتمنحنا الترخيص اللازم لاستضافته وعرضه لتقديم الخدمة ولمن تشاركه معهم.

## 3. الاستخدام المقبول
لا تخالف القانون أو حقوق الآخرين، ولا تنشر محتوى ضاراً أو رسائل مزعجة، ولا تتجاوز الأمن أو تصل إلى بيانات بلا تصريح. يجوز لنا إزالة المحتوى أو تقييد الحساب.

## 4. المسؤولية والتغييرات
قد تتغير معلومات الجهات الخارجية؛ تحقق من المواعيد والأسعار والشروط والحجوزات. الخدمة مقدمة «كما هي» ضمن ما يسمح به القانون. قد نحدّث الشروط ونطلب قبولها. للتواصل: [Contact email].` },
};

export const LEGAL_TRANSLATIONS: Partial<Record<LegalLanguage, typeof french>> = { fr: french, ar: arabic };
