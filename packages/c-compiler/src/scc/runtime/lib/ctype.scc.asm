isalpha:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	call	mz80_full_isalpha_a
	ret

isalnum:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#48
	jr	c,.isalnum_upper
	cp	#58
	jr	c,.isalnum_true
.isalnum_upper:
	cp	#65
	jr	c,.isalnum_lower
	cp	#91
	jr	c,.isalnum_true
.isalnum_lower:
	cp	#97
	jr	c,.isalnum_false
	cp	#123
	jr	c,.isalnum_true
.isalnum_false:
	ld	hl,#0
	ret
.isalnum_true:
	ld	hl,#1
	ret

iscntrl:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#32
	jr	c,.iscntrl_true
	cp	#127
	jr	z,.iscntrl_true
	ld	hl,#0
	ret
.iscntrl_true:
	ld	hl,#1
	ret
isdigit:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#48
	jr	c,.isdigit_false
	cp	#58
	jr	nc,.isdigit_false
	ld	hl,#1
	ret
.isdigit_false:
	ld	hl,#0
	ret

isgraph:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#33
	jr	c,.isgraph_false
	cp	#127
	jr	c,.isgraph_true
.isgraph_false:
	ld	hl,#0
	ret
.isgraph_true:
	ld	hl,#1
	ret
islower:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#97
	jr	c,.islower_false
	cp	#123
	jr	nc,.islower_false
	ld	hl,#1
	ret
.islower_false:
	ld	hl,#0
	ret

isprint:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#32
	jr	c,.isprint_false
	cp	#127
	jr	c,.isprint_true
.isprint_false:
	ld	hl,#0
	ret
.isprint_true:
	ld	hl,#1
	ret

ispunct:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#33
	jr	c,.ispunct_false
	cp	#48
	jr	c,.ispunct_true
	cp	#58
	jr	c,.ispunct_false
	cp	#65
	jr	c,.ispunct_true
	cp	#91
	jr	c,.ispunct_false
	cp	#97
	jr	c,.ispunct_true
	cp	#123
	jr	c,.ispunct_false
	cp	#127
	jr	c,.ispunct_true
.ispunct_false:
	ld	hl,#0
	ret
.ispunct_true:
	ld	hl,#1
	ret
isupper:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#65
	jr	c,.isupper_false
	cp	#91
	jr	nc,.isupper_false
	ld	hl,#1
	ret
.isupper_false:
	ld	hl,#0
	ret
isspace:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#32
	jr	z,.isspace_true
	cp	#9
	jr	c,.isspace_false
	cp	#14
	jr	nc,.isspace_false
.isspace_true:
	ld	hl,#1
	ret
.isspace_false:
	ld	hl,#0
	ret

isxdigit:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#48
	jr	c,.isxdigit_upper
	cp	#58
	jr	c,.isxdigit_true
.isxdigit_upper:
	cp	#65
	jr	c,.isxdigit_lower
	cp	#71
	jr	c,.isxdigit_true
.isxdigit_lower:
	cp	#97
	jr	c,.isxdigit_false
	cp	#103
	jr	c,.isxdigit_true
.isxdigit_false:
	ld	hl,#0
	ret
.isxdigit_true:
	ld	hl,#1
	ret
tolower:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#65
	jr	c,.char
	cp	#91
	jr	nc,.char
	add	a,#32
.char:
	ld	l,a
	ld	h,#0
	ret
toupper:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#97
	jr	c,.char
	cp	#123
	jr	nc,.char
	sub	#32
	jr	.char
mz80_full_isalpha_a:
	cp	#65
	jr	c,.alpha_lower
	cp	#91
	jr	c,.true
.alpha_lower:
	cp	#97
	jr	c,.false
	cp	#123
	jr	nc,.false
.true:
	ld	hl,#1
	ret
.false:
	ld	hl,#0
	ret

; printf and sprintf use the TS compiler's internal variadic ABI: slots are
; pushed right-to-left. IY is the format cursor, IX the next argument slot,
; and DE is the optional sprintf cursor (zero means console output).
