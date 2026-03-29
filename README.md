# Sporty MVP

אב-טיפוס ראשוני לאפליקציית כושר אישית לפי תעודת המוצר.

## מה נבנה כרגע
- 12 תרגילים קבועים.
- הזנת סטים בזמן אמת וחישוב נפח.
- Ghost Mode (הצגת ביצוע קודם לתרגיל).
- טיימר מנוחה פתוח.
- ניקוד, רצפים, PR multiplier, וקנסות יומיים על חוסר אימון.
- מפת חום התאוששות שרירים.
- המלצה על 3 תרגילים "מוכנים" להיום.
- גרף מגמת נפח לתרגיל נבחר.
- מסך Workout Recap בסיום אימון.
- Placeholder לאווטאר גוף: `assets/avatar-placeholder.svg`.

## פריסה ל-GitHub Pages
נוספה תצורת Actions מוכנה בנתיב:

- `.github/workflows/deploy-pages.yml`

כדי לראות את האתר אונליין:
1. העלו את הריפו ל-GitHub.
2. ודאו שיש branch בשם `main` (או `master`/`work` לפי ה-workflow).
3. ב-GitHub > **Settings** > **Pages** בחרו **GitHub Actions** כמקור.
4. בצעו push נוסף אם צריך כדי להפעיל deploy.

כתובת צפויה:

`https://<github-username>.github.io/<repo-name>/`

## הרצה מקומית
פשוט פתחו את `index.html` בדפדפן.
