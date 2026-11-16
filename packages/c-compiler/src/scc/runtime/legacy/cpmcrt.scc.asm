; Minimal CP/M runtime for SCC->mz80 translation.
; Calling convention matches current SCC output style:
;   - first argument at 2(SP)
;   - string output expects CP/M '$'-terminated text
	.module	cpmcrt
	.globl	main
	.globl	exit
	.globl	putchar
	.globl	outchar
	.globl	getchar
	.globl	fputc
	.globl	fgetc
	.globl	.gchar
	.globl	outstr
	.globl	puts
	.globl	.gint
	.area	_CODE
START:
	call	main
	call	exit
	ret
;
; int getchar(void)
getchar:
	ld	c,#1
	call	5
	ld	l,a
	ld	h,#0
	ret
;
; int fgetc(FILE *fp) -- only stdin(0) is supported
fgetc:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	a,h
	or	l
	jr	z,.fgetc0
	ld	hl,#-1
	ret
.fgetc0:
	ld	c,#1
	call	5
	ld	l,a
	ld	h,#0
	ret
;
; void putchar(int ch)
putchar:
outchar:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	e,l
	ld	c,#2
	call	5
	ret
;
; int fputc(int ch, FILE *fp) -- stdout/stderr are treated identically
fputc:
	ld	hl,#4
	add	hl,sp
	call	.gchar
	ld	e,l
	ld	c,#2
	call	5
	ld	l,e
	ld	h,#0
	ret
;
; void outstr(char *s) -- CP/M '$'-terminated string
outstr:
puts:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ex	de,hl
	ld	c,#9
	call	5
	ret
;
; void exit(void)
exit:
	ld	c,#0
	call	5
	ret
;
; fetch char from (HL)
.gchar:	ld	l,(hl)
	ld	h,#0
	ret
;
; fetch int from (HL)
.gint:	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	ret
