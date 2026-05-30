'use strict';

const students = [
  'BOUMBIEGOU-LARDJA TIYAB DONALD',
  'KANAZA ESSOTEYOUNA DAVID',
  'LOVI KINANSOLE YAWA IRIS DEOGRACIAS',
  'OMAROU SADOU OKACHA',
  'SALIFOU IMANE',
  'ZIANGBE',
  'ADJIWANOU YAYRA ELISEE',
  'ADZIMAH SERAPH CEPHAS',
  'AFANGNIVO KOKOU MAWULI',
  'AGBEYIBO ABLA ESTHER',
  'AKPABLI WILLIAMS A. E.',
  'AMANA ESSOREKE FAURE',
  'AWOUGBLA ADJOVI DENISE CHARNELLE',
  'DEKPE KOSSI MAXIME',
  'DOSSOU JOSEPH PRINCE BONY',
  'EKON DEDE LYDIA LAUREEN HARDWICK',
  'HONYIGLOH YANIS CHARBEL',
  'ISSIFOU SEGDA SOUDAISSE',
  'KAMINA SALOMON MOUGIK MOUDRII',
  'KODJOVI OHINI PHILIPPE JACQUES ELOM',
  'KOLANI YENDOUBE',
  'LADJO DARYL GNYMDOU',
  'MABLE SHEKINA B. EUNICE',
  'MAJOYEOGBE DANIEL AKINBOYE ADEBAYO',
  'MANOWOGBO YAO TEKO JUSTIN SANCTUS',
  'MUGISHA LAURIELLE',
  'PASSAH EYRAM WELLBORN',
  'SAMBOE ANITA SPERA',
  'SANDAHLE ASSEFOU DEVA',
  'TCHAKA WUAKU',
  'TCHEYI ESSOMAM SHALOM',
  'TIDJANI SIDIKO REDOLA SAMSEPH'
];

const subjects = [
  {
    title: "Projet 1 - Galerie d'images progressive",
    description: "Affichez une grille d'images recuperees depuis une API. Au scroll, chargez automatiquement les nouvelles images (infinite scroll). Les composants enfants recoivent via props les URL et les legendes.",
    css: `.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}
.image-card {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
}
.image-card img {
  width: 100%;
  height: auto;
  display: block;
}
.image-caption {
  position: absolute;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  color: #fff;
  width: 100%;
  padding: 0.5rem;
}`,
  },
  {
    title: 'Projet 2 - Formulaire dynamique a etapes',
    description: 'Creez un formulaire en plusieurs etapes (wizard). Les donnees de chaque etape sont stockees dans un state, et chaque etape recoit ses champs et callbacks en props.',
    css: `.form-step {
  max-width: 400px;
  margin: auto;
  padding: 2rem;
  border: 1px solid #ccc;
  border-radius: 8px;
}
.form-buttons {
  display: flex;
  justify-content: space-between;
  margin-top: 1rem;
}`,
  },
  {
    title: 'Projet 3 - Lecteur audio simple',
    description: 'Integrez un lecteur audio HTML5. Affichez barre de progression, boutons Play/Pause et volume. Le composant AudioControls recoit via props le ref du <audio>.',
    css: `.audio-player {
  width: 300px;
  margin: 2rem auto;
  text-align: center;
}
.progress {
  width: 100%;
  height: 5px;
  background: #eee;
  margin: 1rem 0;
  border-radius: 3px;
}
.progress-filled {
  height: 5px;
  background: #007bff;
  border-radius: 3px;
}`,
  },
  {
    title: 'Projet 4 - Liste deroulante dependante',
    description: 'Deux <select> imbriques : choisir un pays puis une ville. Les options villes dependent de la selection pays passee en props.',
    css: `.select-group {
  display: flex;
  gap: 1rem;
}
select {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}`,
  },
  {
    title: 'Projet 5 - Chat en temps reel (simule)',
    description: 'Simulez une messagerie instantanee : messages stockes en state. Le composant MessageList recoit la liste en props et scroll automatiquement.',
    css: `.chat-window {
  width: 400px;
  height: 500px;
  border: 1px solid #ccc;
  overflow-y: auto;
  margin: auto;
  display: flex;
  flex-direction: column;
}
.message {
  padding: 0.5rem;
  margin: 0.2rem;
  border-radius: 4px;
  max-width: 70%;
}
.message.self {
  background: #dcf8c6;
  align-self: flex-end;
}
.message.other {
  background: #fff;
  align-self: flex-start;
}`,
  },
  {
    title: 'Projet 6 - Comparateur de devises',
    description: 'Recuperez les taux de change depuis une API. Saisissez un montant et une devise source, affichez la conversion dans plusieurs devises cibles. Les resultats sont passes via props.',
    css: `.converter {
  max-width: 300px;
  margin: auto;
  padding: 1rem;
  border: 1px solid #ccc;
  border-radius: 8px;
}
.converter input,
.converter select {
  width: 100%;
  margin: 0.5rem 0;
  padding: 0.5rem;
}`,
  },
  {
    title: 'Projet 7 - Tableau de bord avec graphiques',
    description: 'Affichez des donnees chiffrees sous forme de graphiques (chart.js ou recharts). La liste des donnees et labels est passee en props.',
    css: `.dashboard {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.chart-card {
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fafafa;
}`,
  },
  {
    title: 'Projet 8 - Selecteur de plage de dates',
    description: "Deux champs <input type='date'>. Le composant DateRange gere la validation (date de fin > date de debut) et passe la plage en props.",
    css: `.date-range {
  display: flex;
  gap: 1rem;
  align-items: center;
}
.date-range input {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}`,
  },
  {
    title: 'Projet 9 - Recherche instantanee',
    description: "Champ de recherche filtrant une liste d'elements. Utilisez useMemo pour optimiser le filtrage. Le composant List recoit les resultats en props.",
    css: `.search {
  max-width: 400px;
  margin: auto;
}
.search input {
  width: 100%;
  padding: 0.5rem;
  margin-bottom: 1rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.list-item {
  padding: 0.5rem;
  border-bottom: 1px solid #eee;
}`,
  },
  {
    title: 'Projet 10 - Modale personnalisee',
    description: "Composant Modal controle via props (visible, onClose). Affichez du contenu arbitraire (children) et gerez le focus et l'echappement avec hooks.",
    css: `.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.5);
  display: flex;
  justify-content: center;
  align-items: center;
}
.modal {
  background: #fff;
  padding: 2rem;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
}`,
  },
  {
    title: 'Projet 11 - Lecteur de flux RSS',
    description: "Fetch d'un flux RSS, parsing et affichage des titres. Le composant FeedItem recoit chaque article en props.",
    css: `.feed {
  max-width: 600px;
  margin: auto;
}
.feed-item {
  padding: 1rem;
  border-bottom: 1px solid #ccc;
}
.feed-item h3 {
  margin: 0;
}`,
  },
  {
    title: 'Projet 12 - Gestionnaire de favoris',
    description: "Liste d'elements avec un bouton 'fav'. Cliquez pour ajouter/supprimer des favoris, stockes en localStorage. Passez la prop isFavorite et un callback.",
    css: `.fav-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 1rem;
}
.card {
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  position: relative;
}
.heart {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  cursor: pointer;
}`,
  },
  {
    title: 'Projet 13 - Gestionnaire de panier (e-commerce)',
    description: 'Affichez une liste de produits, ajoutez des articles au panier. Le panier est un contexte (useContext). Les composants recoivent via props les callbacks et donnees.',
    css: `.product-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}
.product-card {
  border: 1px solid #ccc;
  padding: 1rem;
  border-radius: 8px;
}
.cart {
  position: fixed;
  top: 1rem;
  right: 1rem;
  background: #fff;
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 8px;
}`,
  },
  {
    title: 'Projet 14 - Quiz interactif',
    description: 'Presentez des questions a choix multiple. Les questions passent en props au composant Question. Gerez l\'etat de la question courante et le score.',
    css: `.quiz {
  max-width: 500px;
  margin: auto;
}
.question {
  margin-bottom: 1rem;
}
.answers {
  list-style: none;
  padding: 0;
}
.answers li {
  margin: 0.5rem 0;
  cursor: pointer;
}`,
  },
  {
    title: 'Projet 15 - Planificateur de rendez-vous',
    description: 'Liste de creneaux horaires. Permet de selectionner plusieurs plages. Stockez la selection en state, et passez-la aux enfants via props pour affichage colore.',
    css: `.scheduler {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
  max-width: 600px;
  margin: auto;
}
.slot {
  padding: 1rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  text-align: center;
  cursor: pointer;
}
.slot.selected {
  background: #007bff;
  color: #fff;
}`,
  }
];

async function runSeed(pool) {
  const studentCount = await pool.query('SELECT COUNT(*) FROM grp_students');
  if (Number(studentCount.rows[0].count) === 0) {
    const placeholders = students.map((_, i) => `($${i + 1})`).join(',');
    await pool.query(
      `INSERT INTO grp_students (full_name) VALUES ${placeholders}`,
      students
    );
  }

  const subjectCount = await pool.query('SELECT COUNT(*) FROM grp_subjects');
  if (Number(subjectCount.rows[0].count) === 0) {
    const values = [];
    const placeholders = subjects
      .map((subject, index) => {
        const base = index * 3;
        values.push(subject.title, subject.description, subject.css);
        return `($${base + 1}, $${base + 2}, $${base + 3})`;
      })
      .join(',');

    await pool.query(
      `INSERT INTO grp_subjects (title, description, css) VALUES ${placeholders}`,
      values
    );
  }
}

module.exports = { runSeed };
