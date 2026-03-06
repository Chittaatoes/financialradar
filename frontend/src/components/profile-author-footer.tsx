export function ProfileAuthorFooter() {
  return (
    <div
      className="mt-3 pb-2 text-center text-xs text-muted-foreground opacity-60 hover:opacity-80 transition-opacity duration-200"
      data-testid="profile-author-footer"
    >
      <p>
        Built with discipline by{" "}
        <a
          href="https://instagram.com/chittaatoes"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium opacity-80 hover:underline hover:text-primary transition-colors duration-200 cursor-pointer"
          data-testid="link-author"
        >
          Py Sanjaya
        </a>
      </p>
      <p className="mt-1">
        Version 1.0.0 &middot; Financial Radar
      </p>
    </div>
  );
}
