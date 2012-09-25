# -*- mode: Makefile; -*-

## -----------------------------------------------------------------------------
## --SECTION--                                                           SCANNER
## -----------------------------------------------------------------------------

################################################################################
### @brief built sources
################################################################################

BUILT_SOURCES += $(FLEX_FILES) $(FLEXXX_FILES)

################################################################################
### @brief cleanup
################################################################################

if ENABLE_MAINTAINER_MODE
CLEANUP += $(FLEX_FILES) $(FLEXXX_FILES)

endif

################################################################################
### @brief flex
################################################################################

%.c: %.l
	@top_srcdir@/config/flex-c.sh $(LEX) $@ $<

################################################################################
### @brief flex++
################################################################################

%.cpp: %.ll
	@top_srcdir@/config/flex-c++.sh $(LEX) $@ $<

## -----------------------------------------------------------------------------
## --SECTION--                                                       END-OF-FILE
## -----------------------------------------------------------------------------

## Local Variables:
## mode: outline-minor
## outline-regexp: "^\\(### @brief\\|## --SECTION--\\|# -\\*- \\)"
## End:
