# claude-muster

<p align="center">
  <img src="./assets/header.jpg" alt="claude-muster — orchestrate every agent, from one root" width="100%">
</p>

[English](./README.md) · [日本語](./README.ja.md) · [中文](./README.zh-CN.md) · [한국어](./README.ko.md) · [Español](./README.es.md) · Français

**Orchestrez tous vos agents. Depuis une seule racine.**

Travaillez sur tous vos dépôts depuis une seule session Claude, en laissant le Claude propre à chaque dépôt faire son travail, dans son propre dossier, avec ses skills, ses agents, ses hooks et ses réglages intacts.

## La situation

Imaginez que votre travail tient dans un seul dossier rempli de dépôts git distincts :

```
~/work/
├── webapp/    → a .claude/skills/deploy, .claude/commands/release
├── api/       → a .claude/skills/lint, .claude/agents/db-reviewer, .claude/hooks/pre-commit
└── mobile/    → a .claude/commands/build
```

Chaque dépôt porte son propre `.claude/` : les skills, les agents, les commandes, les hooks et les réglages que son équipe a écrits.

Ouvrez Claude Code **à l'intérieur de `api/`** et vous récupérez tout l'outillage d'api. Très bien. Mais ouvrez-le **dans `~/work/`** pour travailler sur les trois dépôts d'un coup, et cet outillage disparaît, parce que Claude Code lit le `.claude/` du dossier courant et des dossiers au-dessus, jamais des dossiers en dessous.

La solution évidente consiste à tout remonter : copier ou créer des symlinks de chaque `.claude/` vers `~/work/.claude/`. Cela marche pour les skills, mais casse silencieusement le reste. Un hook écrit pour s'exécuter dans `api/` tourne désormais depuis `~/work/`, avec le mauvais répertoire de travail. La permission `deny` d'un dépôt bloque sans bruit le travail de tous les autres. Deux dépôts qui définissent chacun `API_URL` se télescopent en une seule valeur. Les agents, eux, doivent être copiés, donc ils prennent du retard sur l'original. Vous passez votre temps à surveiller un `.claude/` fusionné au lieu de travailler.

## Ce que fait claude-muster

claude-muster prend le parti inverse. Au lieu de remonter l'outillage de chaque dépôt *vers le haut*, dans une seule session, il laisse le `.claude/` de chaque dépôt exactement là où il est et exécute **le Claude propre à ce dépôt, à l'intérieur de ce dépôt**. Le Claude à votre racine devient un orchestrateur : il décide à quel dépôt appartient une tâche, la lui transmet, et récupère le résultat.

```console
$ cd ~/work
$ claude-muster repos

  3 repos you can dispatch to:

  webapp
  api
  mobile

$ claude-muster dispatch api "corrige le test qui échoue dans handler.ts"

  [api] ok

  Trouvé : handler.ts appelait l'ancien `parse()` à deux arguments. J'ai mis à jour l'appel et le test passe.
```

Le processus enfant a lancé `claude` **à l'intérieur de `api/`** : il disposait donc du vrai répertoire de travail d'api, de son environnement, de ses skills, de ses agents, de ses hooks et de ses permissions, exactement comme si vous aviez ouvert Claude là vous-même. Rien n'a été copié. Rien n'a été fusionné. Il n'y a rien qui prenne du retard, ni rien à nettoyer.

Mieux encore : installez la skill de routage et votre Claude racine apprend à faire tout cela de lui-même.

```console
$ claude-muster install     # ajoute une petite skill dans ~/work/.claude/

$ claude
> corrige le test qui échoue dans api et dis-moi quelle est la commande de build de web

  (Claude dispatch vers api, dispatch vers web, et fait remonter les deux résultats)
```

Vous voulez que votre Claude racine connaisse ses dépôts dès l'instant où une session démarre, sans attendre que la skill se déclenche ? Ajoutez `--hook` :

```console
$ claude-muster install --hook    # enregistre aussi un hook SessionStart dans ~/work/.claude/settings.json
```

Désormais, chaque session ouverte ici démarre avec un récapitulatif d'une ligne des dépôts vers lesquels elle peut dispatcher. C'est la seule chose que claude-muster écrit dans votre `settings.json`, et `uninstall` la retire à l'identique.

Et c'est tout l'outil. **claude-muster n'appelle jamais lui-même de LLM.** `dispatch` lance votre CLI `claude` local, qui tourne sur votre propre authentification et votre propre porte-monnaie. claude-muster se contente de décider où envoyer le travail et de récupérer ce qui revient.

## Installation

> **Pas encore sur npm.** Pour l'instant, clonez-le et compilez-le. Une publication `npx claude-muster` est prévue.

```bash
git clone https://github.com/mk668a/claude-muster
cd claude-muster
npm install && npm run build
npm link            # rend `claude-muster` disponible partout
```

Lancez-le ensuite depuis n'importe quelle racine d'espace de travail :

```bash
cd ~/work
claude-muster repos
```

Node 18+. Vous avez aussi besoin du CLI `claude` dans votre `PATH` (c'est lui que `dispatch` exécute).

Vous préférez ne pas faire de `npm link` ? Appelez directement le fichier compilé : `node /path/to/claude-muster/dist/cli.js`.

### Désinstaller claude-muster de votre machine

Attention à la distinction : `claude-muster uninstall` retire la skill de routage d'**un seul espace de travail**, **pas** l'outil. Pour désinstaller l'outil lui-même, annulez le `npm link` et supprimez le clone :

```bash
npm rm -g claude-muster        # ou : npm unlink -g claude-muster, qui annule `npm link`
rm -rf /path/to/claude-muster  # le dossier que vous avez cloné
```

Si vous aviez sauté `npm link` et appelé directement `node .../dist/cli.js`, supprimez simplement le clone.

## Utilisation

```bash
claude-muster repos                      # liste les dépôts enfants vers lesquels dispatcher
claude-muster dispatch <repo> "<task>"   # lance `claude -p "<task>"` à l'intérieur de ce dépôt
claude-muster dispatch --all "<task>"    # diffuse la même tâche vers tous les dépôts
claude-muster install                    # ajoute la skill de routage pour que le Claude racine puisse déléguer
claude-muster install --hook             # informe aussi le Claude racine de ses dépôts au démarrage de session
claude-muster uninstall                  # retire la skill (et toute entrée --hook) de cette racine
claude-muster --version                  # affiche la version installée (forme courte : -v)
```

Pour annuler une installation, lancez `claude-muster uninstall` depuis la racine même où vous l'avez installée. Il retire la skill `muster-dispatch` et, si vous avez utilisé `--hook`, reprend l'entrée SessionStart dans `settings.json`, supprimant le fichier s'il n'en reste rien d'autre. Il ne retire jamais que ce que claude-muster a ajouté.

Pour savoir quelle version vous avez, lancez `claude-muster --version` (ou `claude-muster -v`).

Quelques flags utiles :

```bash
--root <dir>     # racine de l'espace de travail à scanner (défaut : répertoire courant)
--json           # émet les résultats de dispatch / repos en JSON, pour que la session parente les parse
--timeout <ms>   # tue un enfant dispatché s'il tourne trop longtemps
--depth <n>      # profondeur de recherche des .claude/ enfants (défaut : 1)
--path <dir>     # inclut aussi un dépôt situé ailleurs sur cette machine ; répétable
--force          # écrase une skill existante (avec `install`)
-v, --version    # affiche la version
-h, --help       # affiche toutes les commandes et tous les flags
```

### Dispatcher vers un dépôt, ou diffuser vers tous

`dispatch <repo> "<task>"` envoie une tâche autonome à un seul dépôt. Rédigez la tâche comme vous le feriez auprès d'un Claude tout neuf ouvert dans ce dépôt, parce que c'est exactement ce que c'est : l'enfant démarre sans aucun souvenir de votre conversation à la racine.

`dispatch --all "<task>"` envoie la même tâche à tous les dépôts en parallèle et rassemble les résultats. C'est fait pour les inventaires et les passes globales : *« quelle est ta commande de test ? »*, *« y a-t-il un TODO sur l'auth quelque part ? »*, *« passe la version à 2.0 »*. Combinez-le avec `--json` quand vous voulez agréger les réponses vous-même.

### Configuration optionnelle

Par défaut, tout dépôt voisin doté d'un `.claude/` est inclus. Déposez un `claude-muster.json` à la racine pour affiner la sélection :

```jsonc
{
  "include": ["webapp", "api/*", "services/**"],  // quels dépôts cibler (globs, relatifs à la racine)
  "exclude": ["legacy-*"],                          // dépôts à ignorer
  "depth": 2,                                        // profondeur de recherche en dossiers (défaut : 1)
  "paths": ["../shared-tools", "/abs/path/to/repo"]  // dépôts supplémentaires n'importe où sur cette machine (aussi : --path)
}
```

## Comment ça marche

Claude Code lit le `.claude/` de chaque dépôt depuis le dossier du dépôt lui-même et les dossiers au-dessus. claude-muster ne lutte jamais contre ça. Il se contente de démarrer `claude` avec le dépôt enfant comme répertoire de travail :

| Étape | Ce qui se passe |
|---|---|
| **discover** | Parcourt la racine pour trouver les dossiers voisins contenant un `.claude/` (en respectant `claude-muster.json`). |
| **decide** | Le Claude à votre racine (ou vous, en ligne de commande) choisit à quel dépôt appartient une tâche. |
| **dispatch** | Lance `claude -p "<task>" --output-format json` avec le `cwd` positionné sur ce dépôt. |
| **collect** | Parse le résultat final de l'enfant et le rend à l'orchestrateur. |

Parce que l'enfant est un vrai processus `claude` enraciné dans son propre dépôt, tous les problèmes que crée l'approche « tout copier » ne se posent tout simplement pas :

- **Le répertoire de travail est correct.** Les hooks et les scripts tournent depuis le dépôt pour lequel ils ont été écrits.
- **Pas de tir croisé.** Les hooks et les permissions de chaque dépôt ne s'appliquent qu'à la session de ce dépôt, jamais aux autres.
- **Rien ne périme.** Les agents sont lus en direct depuis le dépôt, jamais copiés.
- **Pas de collisions d'environnement.** Chaque processus enfant a son propre environnement.
- **Rien à nettoyer.** Pas de symlinks, pas de réglages fusionnés, pas de manifeste. `install` ajoute une skill et `uninstall` la retire.

## Pourquoi on peut s'y fier

- **claude-muster n'appelle jamais de LLM.** Il lance votre CLI `claude` local, sur votre authentification et votre porte-monnaie. Pas de clés d'API, pas de réseau qui lui soit propre, pas de télémétrie.
- **Il ne touche presque rien sur le disque.** `dispatch` et `repos` ne font que lire vos dossiers pour découvrir les dépôts. La seule chose qu'il écrive un jour, c'est la skill de routage posée par `install`, et `uninstall` la reprend.
- **Chaque enfant est l'original.** Dispatcher vers `api` revient à ouvrir Claude dans `api/` vous-même : aucune surprise sur l'outillage réellement actif.

## Ce qu'il ne fait pas (encore)

- **Sessions enfants persistantes.** Chaque `dispatch` est une exécution `claude -p` fraîche et à un seul coup : un enfant ne se souvient donc pas de la tâche précédente que vous lui avez envoyée. Des sessions chaudes et durables par dépôt sont au programme.
- **Dépôts sur d'autres machines.** N'importe où sur votre système de fichiers local fonctionne (voir `paths`), mais les dépôts distants ou en réseau, non.
- **Trancher à votre place quand c'est ambigu.** Si une tâche peut appartenir à plusieurs dépôts, l'orchestrateur doit demander plutôt que deviner. La skill de routage est écrite pour faire exactement ça.

## Votre compte, vos règles

`dispatch` lance votre propre CLI `claude` installé en local, sous votre propre compte Anthropic (un abonnement Claude ou une clé d'API). claude-muster ne fournit, ne stocke et ne partage jamais d'identifiants, et il utilise le mode headless documenté de Claude Code (`claude -p`). C'est à vous de respecter les [conditions et politiques d'usage d'Anthropic](https://www.anthropic.com/legal/aup) pour votre propre formule.

Une remarque pratique : `dispatch --all` démarre plusieurs processus `claude` d'un coup, ce qui peut atteindre les limites de débit d'Anthropic si vous diffusez largement. Gardez une concurrence raisonnable.

## Licence

MIT.
