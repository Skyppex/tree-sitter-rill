{pkgs, ...}: {
  # https://devenv.sh/packages/
  packages = with pkgs; [
    tree-sitter
    alejandra
  ];

  # https://devenv.sh/languages/
  languages.nix.enable = true;
  languages.javascript.enable = true;
}
