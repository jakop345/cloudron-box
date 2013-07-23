
NW_BUNDLE_SOURCES = $(filter-out src/*.jmp, $(wildcard src/*))
NW_BUNDLE         = bin/client-nw.zip
NW_MANIFEST       = package.json

JUMP_SOURCES     = $(wildcard src/*.jmp)
JUMP_BUNDLE_SRC	 = src/index.js
BUNGEEJS_OUT     = $(JUMP_SOURCES:%.jmp=%.jmp.js)
BUNGEEJS_BUNDLE	 = src/bundle.js

PACKAGER          = zip
PACKAGER_OPTIONS  =

BROWSERIFY        = ./node_modules/browserify/bin/cmd.js
BUNGEEJS_COMPILER = ./node_modules/bungee/bin/bungee
BUNGEEJS_OPTIONS  =

ifeq ($(shell which $(PACKAGER)),)
$(error '$(PACKAGER)' not found.)
endif

.PHONY: clean $(NW_BUNDLE)

# Without this make considers non-minified module files temporary and deletes
# them because of the chained implicit rules below.
.SECONDARY: $(BUNGEEJS_OUT)

all: $(BUNGEEJS_BUNDLE) $(NW_BUNDLE)

clean:
	@rm -f $(NW_BUNDLE) $(BUNGEEJS_OUT) $(BUNGEEJS_BUNDLE)

$(NW_BUNDLE): $(NW_BUNDLE_SOURCES)
	@echo "==> Remove old node-webkit bundle $(NW_BUNDLE) file."
	@rm -f $(NW_BUNDLE)
	@echo "==> Create new bundle $(NW_BUNDLE) file."
	@$(PACKAGER) $(PACKAGER_OPTIONS) $(NW_BUNDLE) $(NW_BUNDLE_SOURCES) $(NW_MANIFEST)

$(BUNGEEJS_BUNDLE): $(BUNGEEJS_OUT)
	@echo "==> Remove old BungeeJS bundle $(BUNGEEJS_BUNDLE) file."
	@rm -f $(BUNGEEJS_BUNDLE)
	@echo "==> Create Bungee bundle $(BUNGEEJS_BUNDLE)."
	@$(BROWSERIFY) $(JUMP_BUNDLE_SRC) -o $(BUNGEEJS_BUNDLE)

%.jmp.js : %.jmp
	@echo "==> Generate JavaScript from JUMP ($< -> $@)"
	@$(BUNGEEJS_COMPILER) $(BUNGEEJS_OPTIONS) $< $@
